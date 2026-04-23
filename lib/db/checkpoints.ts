import { and, eq } from "drizzle-orm";
import {
  challenge_checkpoints,
  checkpoint_completions,
  participants,
} from "./schema";
import type { Db } from "./index";

/**
 * Recount this participant's approved checkpoints against the challenge's
 * total and persist the result on the participants row. Used by both the
 * auto-approve path (nostr_action / nostr_hashtag / automatic) and the
 * manual creator-approval path. Both callers must use the count strategy
 * (not an increment) so concurrent approvals can't double-count.
 *
 * Returns `{ approved, total, completed }` so callers can decide whether
 * to publish downstream effects (badge award, notifications, etc.).
 */
export async function recomputeCheckpointProgress(
  db: Db,
  participantId: string,
  challengeId: string
): Promise<{ approved: number; total: number; completed: boolean }> {
  const approved = await db
    .select({ id: checkpoint_completions.id })
    .from(checkpoint_completions)
    .where(
      and(
        eq(checkpoint_completions.participant_id, participantId),
        eq(checkpoint_completions.status, "approved")
      )
    );

  const total = await db
    .select({ id: challenge_checkpoints.id })
    .from(challenge_checkpoints)
    .where(eq(challenge_checkpoints.challenge_id, challengeId));

  const approvedCount = approved.length;
  const totalCount = total.length;
  const isComplete = totalCount > 0 && approvedCount >= totalCount;

  await db
    .update(participants)
    .set({
      progress: approvedCount,
      ...(isComplete
        ? { status: "completed" as const, completed_at: new Date() }
        : {}),
    })
    .where(eq(participants.id, participantId));

  return { approved: approvedCount, total: totalCount, completed: isComplete };
}
