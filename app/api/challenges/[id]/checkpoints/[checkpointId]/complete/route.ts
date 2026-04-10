import { NextRequest } from "next/server";
import { eq, and, asc, inArray, lt } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "@/lib/api/errors";
import {
  challenges,
  challenge_checkpoints,
  checkpoint_completions,
  participants,
} from "@/lib/db/schema";
import { verifyLikeForTarget } from "@/lib/nostr/verify-like";

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    return (cause as { code?: unknown }).code === "23505";
  }
  return false;
}

// POST /api/challenges/[id]/checkpoints/[checkpointId]/complete
// Participant marks a checkpoint as done. Branches on the checkpoint's
// verification_type (automatic/creator_approval/nostr_action) and, for
// sequential challenges, refuses if any earlier checkpoint isn't approved.
export const POST = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const checkpointId = params.checkpointId;

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);
  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.status === "cancelled")
    throw new BadRequestError("This challenge has been cancelled");
  if (challenge.status === "completed")
    throw new BadRequestError("This challenge is already completed");

  const [checkpoint] = await db
    .select()
    .from(challenge_checkpoints)
    .where(
      and(
        eq(challenge_checkpoints.id, checkpointId),
        eq(challenge_checkpoints.challenge_id, params.id)
      )
    )
    .limit(1);
  if (!checkpoint) throw new NotFoundError("Checkpoint");

  const [participation] = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.challenge_id, params.id),
        eq(participants.user_id, session!.user_id),
        eq(participants.status, "active")
      )
    )
    .limit(1);
  if (!participation)
    throw new ForbiddenError("You must join this challenge first");

  // Sequential mode: refuse unless every prior checkpoint (lower `order`)
  // is already approved for this participant.
  if (challenge.checkpoint_mode === "sequential" && checkpoint.order > 0) {
    const priors = await db
      .select({ id: challenge_checkpoints.id })
      .from(challenge_checkpoints)
      .where(
        and(
          eq(challenge_checkpoints.challenge_id, params.id),
          lt(challenge_checkpoints.order, checkpoint.order)
        )
      )
      .orderBy(asc(challenge_checkpoints.order));
    const priorIds = priors.map((p) => p.id);
    if (priorIds.length > 0) {
      const doneRows = await db
        .select({ checkpoint_id: checkpoint_completions.checkpoint_id })
        .from(checkpoint_completions)
        .where(
          and(
            eq(checkpoint_completions.participant_id, participation.id),
            eq(checkpoint_completions.status, "approved"),
            inArray(checkpoint_completions.checkpoint_id, priorIds)
          )
        );
      if (doneRows.length < priorIds.length) {
        throw new BadRequestError(
          "Complete the previous checkpoint before this one"
        );
      }
    }
  }

  const body = await req.json().catch(() => ({}));
  const { content } = body as { content?: unknown };

  let resolvedContent: string | null = null;
  let proofEventId: string | null = null;
  let autoApprove = false;

  if (checkpoint.verification_type === "nostr_action") {
    if (!checkpoint.nostr_action_target_event_id) {
      throw new BadRequestError("Checkpoint is missing a target event id");
    }
    const result = await verifyLikeForTarget({
      likerPubkey: session!.nostr_pubkey,
      targetEventId: checkpoint.nostr_action_target_event_id,
    });
    if (!result.valid || !result.proofEventId) {
      throw new BadRequestError(
        "Like not found on Nostr relays for the target event"
      );
    }
    proofEventId = result.proofEventId;
    autoApprove = true;
  } else {
    if (!content || typeof content !== "string" || content.trim().length < 5) {
      throw new BadRequestError("Proof content must be at least 5 characters");
    }
    resolvedContent = content.trim();
    autoApprove = checkpoint.verification_type === "automatic";
  }

  let completion: typeof checkpoint_completions.$inferSelect;
  try {
    [completion] = await db
      .insert(checkpoint_completions)
      .values({
        participant_id: participation.id,
        checkpoint_id: checkpoint.id,
        content: resolvedContent,
        proof_event_id: proofEventId,
        status: autoApprove ? "approved" : "pending",
        completed_at: autoApprove ? new Date() : null,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new BadRequestError("This checkpoint is already completed");
    }
    throw err;
  }

  if (autoApprove) {
    // Count this participant's approved checkpoints and bump progress.
    const approved = await db
      .select({ id: checkpoint_completions.id })
      .from(checkpoint_completions)
      .where(
        and(
          eq(checkpoint_completions.participant_id, participation.id),
          eq(checkpoint_completions.status, "approved")
        )
      );
    const totalCheckpoints = await db
      .select({ id: challenge_checkpoints.id })
      .from(challenge_checkpoints)
      .where(eq(challenge_checkpoints.challenge_id, params.id));

    const newProgress = approved.length;
    const isComplete = newProgress >= totalCheckpoints.length;

    await db
      .update(participants)
      .set({
        progress: newProgress,
        ...(isComplete
          ? { status: "completed" as const, completed_at: new Date() }
          : {}),
      })
      .where(eq(participants.id, participation.id));
  }

  return new CreatedResponse(completion);
});
