import { eq, and, type InferSelectModel } from "drizzle-orm";
import { getTableName, type Table } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { NotFoundError, ForbiddenError } from "./errors";

// The drizzle-inferred row shape (dates as `Date`, not ISO strings).
// `lib/types.ts#Participant` is the serialized-to-client shape and
// doesn't apply to raw DB reads.
export type ParticipantRow = InferSelectModel<typeof participants>;

// Turn a snake_case / plural table name into a singular PascalCase label
// for the error message ("challenges" → "Challenge"). Covers the common
// drizzle naming convention used in this codebase; any caller that
// wants a different label can pass `resourceName` explicitly.
function defaultResourceName(tableName: string): string {
  if (!tableName) return "Resource";
  const singular = tableName.endsWith("s") ? tableName.slice(0, -1) : tableName;
  const pascal = singular
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ")
    .trim();
  return pascal || "Resource";
}

interface FindResourceOptions<T extends PgTable> {
  resourceName?: string;
  ownerField?: keyof InferSelectModel<T>;
  session?: { user_id: string };
  forbiddenMessage?: string;
}

/**
 * Fetch a single row by primary key and optionally assert the session
 * user owns it. Consolidates the "SELECT ... LIMIT 1; 404 if missing;
 * 403 if not owner" triplet repeated across API routes.
 *
 * - Throws `NotFoundError(resourceName)` when no row matches.
 * - Throws `ForbiddenError(forbiddenMessage)` when `ownerField` +
 *   `session` are provided and `row[ownerField] !== session.user_id`.
 */
export async function findResourceOrOwn<T extends PgTable>(
  db: Db,
  table: T,
  id: string,
  options: FindResourceOptions<T> = {}
): Promise<InferSelectModel<T>> {
  const {
    resourceName,
    ownerField,
    session,
    forbiddenMessage = "Only the owner can perform this action",
  } = options;

  // `id` is a convention — every table in this schema has a uuid PK
  // named `id`. Cast through `unknown` to reconcile drizzle's narrow
  // column type with the generic `PgTable` parameter; callers only see
  // the fully typed row back.
  const idColumn = (table as unknown as { id: Parameters<typeof eq>[0] }).id;

  const rows = await db
    .select()
    .from(table as PgTable)
    .where(eq(idColumn, id))
    .limit(1);

  const row = rows[0] as InferSelectModel<T> | undefined;

  if (!row) {
    const label = resourceName ?? defaultResourceName(getTableName(table as Table));
    throw new NotFoundError(label);
  }

  if (ownerField && session) {
    const ownerValue = (row as Record<string, unknown>)[ownerField as string];
    if (ownerValue !== session.user_id) {
      throw new ForbiddenError(forbiddenMessage);
    }
  }

  return row;
}

/**
 * Lookup the `participants` row for a (challenge, user) pair. Returns
 * `undefined` when the user hasn't joined the challenge. Callers that
 * need to filter by `status` (active/completed/withdrawn) should build
 * their own query — those have distinct semantics.
 */
export async function findParticipation(
  db: Db,
  challengeId: string,
  userId: string
): Promise<ParticipantRow | undefined> {
  const [row] = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.challenge_id, challengeId),
        eq(participants.user_id, userId)
      )
    )
    .limit(1);

  return row;
}
