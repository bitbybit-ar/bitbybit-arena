import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { NotFoundError } from "@/lib/api/errors";
import { createVerifySubmissionHandler } from "@/lib/api/verify-submission-handler";
import { VerifyCheckpointCompletionBodySchema } from "@/lib/schemas/completions";
import {
  challenges,
  challenge_checkpoints,
  checkpoint_completions,
  participants,
} from "@/lib/db/schema";
import { recomputeCheckpointProgress } from "@/lib/db/checkpoints";

type CheckpointCompletionRow = InferSelectModel<typeof checkpoint_completions>;
type ChallengeRow = InferSelectModel<typeof challenges>;
type CheckpointRow = InferSelectModel<typeof challenge_checkpoints>;
type ParticipantRow = InferSelectModel<typeof participants>;

interface CheckpointVerifyExtra {
  checkpoint: CheckpointRow;
  participant: ParticipantRow;
}

// POST /api/checkpoint-completions/[id]/verify — creator approves or
// rejects a pending checkpoint_completions row. Mirrors
// /api/completions/[id]/verify but operates on the per-checkpoint table.
export const POST = createVerifySubmissionHandler<
  { status: "approved" | "rejected"; reject_reason?: string | null },
  CheckpointCompletionRow,
  ChallengeRow,
  CheckpointVerifyExtra
>({
  table: checkpoint_completions,
  bodySchema: VerifyCheckpointCompletionBodySchema,
  challengeCreatorField: "creator_id",
  submissionStatusField: "status",
  forbiddenMessage: "Only the challenge creator can review submissions",
  alreadyReviewedMessage: "This submission has already been reviewed",
  notificationContext: "checkpoint_verified",
  async fetchContext({ db, params }) {
    const [row] = await db
      .select({
        completion: checkpoint_completions,
        checkpoint: challenge_checkpoints,
        challenge: challenges,
        participant: participants,
      })
      .from(checkpoint_completions)
      .innerJoin(
        challenge_checkpoints,
        eq(checkpoint_completions.checkpoint_id, challenge_checkpoints.id)
      )
      .innerJoin(
        challenges,
        eq(challenge_checkpoints.challenge_id, challenges.id)
      )
      .innerJoin(
        participants,
        eq(checkpoint_completions.participant_id, participants.id)
      )
      .where(eq(checkpoint_completions.id, params.id))
      .limit(1);

    if (!row) throw new NotFoundError("Checkpoint submission");

    return {
      submission: row.completion,
      challenge: row.challenge,
      extra: { checkpoint: row.checkpoint, participant: row.participant },
    };
  },
  updatePatch(_ctx, body) {
    return {
      status: body.status,
      // reject_reason is only meaningful for rejections; cleared on
      // approve so a retry that gets re-approved doesn't carry the
      // stale note.
      reject_reason: body.status === "rejected" ? body.reject_reason ?? null : null,
      completed_at: body.status === "approved" ? new Date() : null,
    };
  },
  async afterUpdate({ db, extra, challenge, status }) {
    if (status !== "approved") return;
    await recomputeCheckpointProgress(db, extra.participant.id, challenge.id);
  },
  notification({ submission, challenge, extra, session, status }, _updated, body) {
    if (extra.participant.user_id === session.user_id) return null;
    return {
      userId: extra.participant.user_id,
      type: "checkpoint_verified",
      title:
        status === "approved" ? "Checkpoint approved!" : "Checkpoint rejected",
      body: `Your proof for "${extra.checkpoint.title}" on "${challenge.title}" was ${status}.`,
      metadata: {
        status,
        challenge_id: challenge.id,
        challenge_title: challenge.title,
        checkpoint_id: extra.checkpoint.id,
        checkpoint_title: extra.checkpoint.title,
        checkpoint_completion_id: submission.id,
        reject_reason: status === "rejected" ? body.reject_reason ?? null : null,
      },
    };
  },
});
