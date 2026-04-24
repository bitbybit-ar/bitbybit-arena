import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ZodType } from "zod";
import type { AuthSession } from "@/lib/auth";
import type { Db } from "@/lib/db";
import { apiHandler } from "./handler";
import { parseBody } from "./parse";
import { BadRequestError, ForbiddenError } from "./errors";
import { notifyUser } from "@/lib/notifications";
import type { NotificationType } from "@/lib/types";

// The creator review endpoints for both `completions` and
// `checkpoint_completions` follow the same eight-step shape: parse body
// → fetch the submission row + parent challenge → authz the caller is
// the creator → guard the row is still pending → build the update patch
// → optionally bump participant/checkpoint progress → persist via
// `db.batch` so the completion and the progress write land together
// → notify the submitter. This module consolidates that shape behind a
// single factory so each route collapses to a config object.
//
// The factory deliberately keeps the fetch step pluggable: one route
// fetches submission + challenge with two separate SELECTs, the other
// uses a single four-way join to also pull the checkpoint and the
// participant row. Forcing both into the same query shape would regress
// the joined path for no real reuse gain, so `fetchContext` returns
// whatever `extra` payload the caller needs and the downstream hooks
// receive that payload untyped-by-the-factory but strongly typed at the
// call site via the `Extra` generic.

// Minimal body shape every config must satisfy — schemas can add extra
// optional fields (like `reject_reason`) and they'll flow through to
// `updatePatch` / `notification` via the parsed body rather than here.
interface VerifyBodyCore {
  status: "approved" | "rejected";
}

// A Drizzle statement builder — returned by `db.update(...)` etc before
// it's awaited. `db.batch` accepts these directly. The concrete type
// isn't exported by drizzle in a stable form; we take the same
// "untyped at the boundary, awaited by the driver" posture the routes
// already relied on.
type BatchStatement = Parameters<Db["batch"]>[0][number];

export interface VerifySubmissionContext<Row, Challenge, Extra> {
  submission: Row;
  challenge: Challenge;
  extra: Extra;
  status: "approved" | "rejected";
  rejectReason: string | null;
  session: AuthSession;
  db: Db;
}

export interface VerifySubmissionNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface VerifySubmissionConfig<
  Body extends VerifyBodyCore,
  Row,
  Challenge,
  Extra,
  Updated = Row,
> {
  /** Drizzle table whose PK matches `params.id`. */
  table: PgTable;
  /** Zod schema for the request body. Must at least produce `{ status }`. */
  bodySchema: ZodType<Body>;
  /**
   * Resolve the submission row, its parent challenge, and any extra
   * joined data the update patch / notification / extra writes need.
   * Throws `NotFoundError` when the submission doesn't exist. Callers
   * are free to do this as two SELECTs or one joined query.
   */
  fetchContext: (args: {
    db: Db;
    session: AuthSession;
    params: Record<string, string>;
    body: Body;
  }) => Promise<{ submission: Row; challenge: Challenge; extra: Extra }>;
  /**
   * Owner authz: reads `creator_id` off the challenge the fetch
   * returned and compares against `session.user_id`. Pulled out as a
   * config field so the 403 copy matches the route exactly.
   */
  challengeCreatorField: keyof Challenge & string;
  forbiddenMessage: string;
  /**
   * Guard that the submission is still `pending`. Pulled out as
   * config so each route keeps its exact error copy.
   */
  alreadyReviewedMessage: string;
  submissionStatusField: keyof Row & string;
  /** Build the column patch for the update statement. */
  updatePatch: (
    ctx: VerifySubmissionContext<Row, Challenge, Extra>,
    body: Body
  ) => Record<string, unknown>;
  /**
   * Optional extra Drizzle statement builders to batch alongside the
   * update. Returned but not awaited — the factory passes them to
   * `db.batch` so the update and the progress write land as one Neon
   * HTTP transaction. Return `[]` (or don't provide the hook) to run a
   * plain non-batched update.
   */
  extraWrites?: (
    ctx: VerifySubmissionContext<Row, Challenge, Extra>,
    body: Body
  ) => Promise<BatchStatement[]>;
  /**
   * Optional side-effect run after the update has persisted. Used by
   * the checkpoint-completion route to recompute per-participant
   * checkpoint progress (which reads the freshly-approved row and so
   * must run after the batch, not inside it).
   */
  afterUpdate?: (
    ctx: VerifySubmissionContext<Row, Challenge, Extra>,
    updated: Updated,
    body: Body
  ) => Promise<void>;
  /**
   * Notification details for the submitter. Return `null` to skip
   * (e.g. when the submitter is the creator — the routes already
   * suppress self-notifications and the factory preserves that).
   */
  notification: (
    ctx: VerifySubmissionContext<Row, Challenge, Extra>,
    updated: Updated,
    body: Body
  ) => VerifySubmissionNotification | null;
  /**
   * Human-readable label for the notification error-log tag. Forwarded
   * to `notifyUser`'s `context` argument so log lines stay scoped.
   */
  notificationContext?: string;
}

/**
 * Build an `apiHandler` POST for the "creator approves or rejects a
 * submission" shape. See file-level comment for why the fetch and
 * side-effect hooks exist as separate knobs.
 */
export function createVerifySubmissionHandler<
  Body extends VerifyBodyCore,
  Row extends Record<string, unknown>,
  Challenge extends Record<string, unknown>,
  Extra,
  Updated = Row,
>(config: VerifySubmissionConfig<Body, Row, Challenge, Extra, Updated>) {
  return apiHandler(async (req: NextRequest, { session, db, params }) => {
    const body = await parseBody(req, config.bodySchema);
    // Cast through the core shape — the bodySchema generic guarantees
    // Body extends VerifyBodyCore but TS can't see that `parseBody`'s
    // inferred z.infer<T> is the same thing.
    const core = body as unknown as Body;
    const { status } = core;
    const rejectReason =
      "reject_reason" in core
        ? ((core as { reject_reason?: string | null }).reject_reason ?? null)
        : null;

    const { submission, challenge, extra } = await config.fetchContext({
      db,
      session: session!,
      params,
      body: core,
    });

    // Authz before the status check so a non-creator probing a
    // submission id can't tell whether it exists or whether it's been
    // reviewed. Mirrors the route-level comments.
    const creatorId = challenge[config.challengeCreatorField];
    if (creatorId !== session!.user_id) {
      throw new ForbiddenError(config.forbiddenMessage);
    }
    if (submission[config.submissionStatusField] !== "pending") {
      throw new BadRequestError(config.alreadyReviewedMessage);
    }

    const ctx: VerifySubmissionContext<Row, Challenge, Extra> = {
      submission,
      challenge,
      extra,
      status,
      rejectReason,
      session: session!,
      db,
    };

    const patch = config.updatePatch(ctx, core);
    const idColumn = (config.table as unknown as { id: Parameters<typeof eq>[0] }).id;
    const updateStmt = db
      .update(config.table)
      .set(patch)
      .where(eq(idColumn, params.id))
      .returning();

    const extraWrites = config.extraWrites ? await config.extraWrites(ctx, core) : [];

    let updated: Updated;
    if (extraWrites.length > 0) {
      // neon-http's drizzle driver runs `db.batch([...])` as a single
      // implicit transaction — the completion update and the progress
      // write land together.
      const [firstRows] = await db.batch([
        updateStmt as unknown as BatchStatement,
        ...extraWrites,
      ]);
      updated = (firstRows as Updated[])[0];
    } else {
      const [row] = await updateStmt;
      updated = row as unknown as Updated;
    }

    if (config.afterUpdate) {
      await config.afterUpdate(ctx, updated, core);
    }

    const notification = config.notification(ctx, updated, core);
    if (notification) {
      await notifyUser(
        notification.userId,
        notification.type,
        notification.title,
        notification.body,
        notification.metadata,
        config.notificationContext
      );
    }

    return updated;
  });
}
