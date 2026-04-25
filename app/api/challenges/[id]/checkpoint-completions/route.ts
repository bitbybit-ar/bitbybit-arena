import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { NotFoundError, ForbiddenError } from "@/lib/api/errors";
import {
  challenges,
  challenge_checkpoints,
  checkpoint_completions,
  participants,
  users,
} from "@/lib/db/schema";

// GET /api/challenges/[id]/checkpoint-completions
// Creator-only — returns *all* checkpoint_completions rows for the
// challenge with the submitter's user info attached. Drives the
// per-user submission-details modal in the Manage tab so a creator
// can see every step a given participant has worked through, not just
// the still-pending ones surfaced by /pending-checkpoint-submissions.
//
// Bounded by the challenge's checkpoint count × participant count, so
// no pagination — a 50-checkpoint challenge with 200 participants is
// already an outlier and still fits comfortably in a single response.
export const GET = apiHandler(async (_req: NextRequest, { session, db, params }) => {
  const [challenge] = await db
    .select({ id: challenges.id, creator_id: challenges.creator_id })
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);
  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.creator_id !== session!.user_id) {
    throw new ForbiddenError(
      "Only the challenge creator can read every participant's checkpoint completions"
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
      status: checkpoint_completions.status,
      reject_reason: checkpoint_completions.reject_reason,
      completed_at: checkpoint_completions.completed_at,
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
    .where(eq(challenge_checkpoints.challenge_id, params.id));

  return rows.map((r) => ({
    id: r.id,
    checkpoint_id: r.checkpoint_id,
    participant_id: r.participant_id,
    content: r.content,
    image_url: r.image_url,
    proof_event_id: r.proof_event_id,
    status: r.status,
    reject_reason: r.reject_reason,
    completed_at: r.completed_at as unknown as string | null,
    created_at: r.created_at as unknown as string,
    user: {
      id: r.user_id,
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      nostr_pubkey: r.nostr_pubkey,
    },
  }));
});
