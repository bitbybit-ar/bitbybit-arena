import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "@/lib/api/errors";
import { VerifyCompletionBodySchema } from "@/lib/schemas/completions";
import {
  challenges,
  challenge_checkpoints,
  checkpoint_completions,
  participants,
} from "@/lib/db/schema";
import { recomputeCheckpointProgress } from "@/lib/db/checkpoints";
import { createNotification } from "@/lib/notifications";

// POST /api/checkpoint-completions/[id]/verify — creator approves or
// rejects a pending checkpoint_completions row. Mirrors
// /api/completions/[id]/verify but operates on the per-checkpoint table.
export const POST = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const { status } = await parseBody(req, VerifyCompletionBodySchema);

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
  if (row.completion.status !== "pending") {
    throw new BadRequestError("This submission has already been reviewed");
  }
  if (row.challenge.creator_id !== session!.user_id) {
    throw new ForbiddenError(
      "Only the challenge creator can review submissions"
    );
  }

  const [updated] = await db
    .update(checkpoint_completions)
    .set({
      status,
      completed_at: status === "approved" ? new Date() : null,
    })
    .where(eq(checkpoint_completions.id, params.id))
    .returning();

  if (status === "approved") {
    await recomputeCheckpointProgress(
      db,
      row.participant.id,
      row.challenge.id
    );
  }

  if (row.participant.user_id !== session!.user_id) {
    try {
      await createNotification(
        row.participant.user_id,
        "checkpoint_verified",
        status === "approved"
          ? "Checkpoint approved!"
          : "Checkpoint rejected",
        `Your proof for "${row.checkpoint.title}" on "${row.challenge.title}" was ${status}.`,
        {
          status,
          challenge_id: row.challenge.id,
          challenge_title: row.challenge.title,
          checkpoint_id: row.checkpoint.id,
          checkpoint_title: row.checkpoint.title,
          checkpoint_completion_id: row.completion.id,
        }
      );
    } catch (err) {
      console.error("notification:checkpoint_verified failed", err);
    }
  }

  return updated;
});
