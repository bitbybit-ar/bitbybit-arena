import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { NotFoundError, ForbiddenError } from "@/lib/api/errors";
import { LimitSchema } from "@/lib/schemas/pagination";
import {
  challenges,
  challenge_checkpoints,
  checkpoint_completions,
  participants,
  users,
} from "@/lib/db/schema";
import type { PendingCheckpointSubmission } from "@/lib/types";

// Cursor is composite: `<iso>|<uuid>` of the last row. Timestamp alone
// isn't enough because Postgres stores `created_at` at microsecond
// precision while JS Date.toISOString() truncates to milliseconds —
// two rows created within the same millisecond (rare in prod, common
// in tests and at burst time) would re-include the cursor row on the
// next page if we compared on the timestamp only. Pairing with the
// row id gives a total order and a strictly-advancing cursor.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CursorSchema = z
  .string()
  .optional()
  .refine((v) => {
    if (v === undefined) return true;
    const parts = v.split("|");
    if (parts.length !== 2) return false;
    const [iso, id] = parts;
    return !Number.isNaN(new Date(iso).getTime()) && UUID_RE.test(id);
  }, "cursor must be `<ISO-8601>|<uuid>`");

const QuerySchema = z.object({
  cursor: CursorSchema,
  limit: LimitSchema(1, 50, 20),
});

// GET /api/challenges/[id]/pending-checkpoint-submissions
// Creator-only paginated list of pending checkpoint_completions rows
// for this challenge. Older code embedded the first page inside
// GET /api/challenges/[id]; this endpoint lets the review card grow
// a "Load more" button without fetching the whole challenge payload
// again.
export const GET = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const { cursor, limit } = parseQuery(req, QuerySchema);

  const [challenge] = await db
    .select({ id: challenges.id, creator_id: challenges.creator_id })
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);
  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.creator_id !== session!.user_id) {
    throw new ForbiddenError(
      "Only the challenge creator can review submissions"
    );
  }

  const conditions = [
    eq(challenge_checkpoints.challenge_id, params.id),
    eq(checkpoint_completions.status, "pending"),
  ];

  // Cursor carries the last row's (created_at, id). We compare as a
  // tuple so ordering is total and a row never bleeds across pages
  // when two submissions share a timestamp.
  if (cursor) {
    const [iso, id] = cursor.split("|");
    conditions.push(
      sql`(${checkpoint_completions.created_at}, ${checkpoint_completions.id}) > (${new Date(iso)}, ${id})`
    );
  }

  const rows = await db
    .select({
      id: checkpoint_completions.id,
      checkpoint_id: checkpoint_completions.checkpoint_id,
      participant_id: checkpoint_completions.participant_id,
      content: checkpoint_completions.content,
      image_url: checkpoint_completions.image_url,
      proof_event_id: checkpoint_completions.proof_event_id,
      created_at: checkpoint_completions.created_at,
      user_id: users.id,
      username: users.username,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
      nostr_pubkey: users.nostr_pubkey,
    })
    .from(checkpoint_completions)
    .innerJoin(
      challenge_checkpoints,
      eq(checkpoint_completions.checkpoint_id, challenge_checkpoints.id)
    )
    .innerJoin(
      participants,
      eq(checkpoint_completions.participant_id, participants.id)
    )
    .innerJoin(users, eq(participants.user_id, users.id))
    .where(and(...conditions))
    .orderBy(
      asc(checkpoint_completions.created_at),
      asc(checkpoint_completions.id)
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const sliced = rows.slice(0, limit);
  const items: PendingCheckpointSubmission[] = sliced.map((p) => ({
    id: p.id,
    checkpoint_id: p.checkpoint_id,
    participant_id: p.participant_id,
    content: p.content,
    image_url: p.image_url,
    proof_event_id: p.proof_event_id,
    // apiHandler's JSON serialization turns this into an ISO string
    // that matches the shared `PendingCheckpointSubmission` type.
    created_at: p.created_at as unknown as string,
    participant: {
      user: {
        id: p.user_id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        nostr_pubkey: p.nostr_pubkey,
      },
    },
  }));

  const last = sliced[sliced.length - 1];
  const nextCursor =
    hasMore && last && last.created_at instanceof Date
      ? `${last.created_at.toISOString()}|${last.id}`
      : null;

  return { items, nextCursor };
});
