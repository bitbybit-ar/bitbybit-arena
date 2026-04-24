import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { NotFoundError, ForbiddenError } from "@/lib/api/errors";
import { IsoCursorSchema, LimitSchema } from "@/lib/schemas/pagination";
import {
  challenges,
  challenge_checkpoints,
  checkpoint_completions,
  participants,
  users,
} from "@/lib/db/schema";
import type { PendingCheckpointSubmission } from "@/lib/types";

const QuerySchema = z.object({
  cursor: IsoCursorSchema,
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
  // Cursor is the ISO `created_at` of the last row in the previous
  // page; we order ASC (oldest first) so `>` advances forward through
  // the queue.
  if (cursor) {
    conditions.push(sql`${checkpoint_completions.created_at} > ${cursor}`);
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
    .orderBy(asc(checkpoint_completions.created_at))
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

  const lastCreatedAt = sliced[sliced.length - 1]?.created_at;
  const nextCursor =
    hasMore && lastCreatedAt instanceof Date
      ? lastCreatedAt.toISOString()
      : null;

  return { items, nextCursor };
});
