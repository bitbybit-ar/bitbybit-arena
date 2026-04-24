import { NextRequest } from "next/server";
import { eq, and, asc, inArray, lt } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "@/lib/api/errors";
import { CompleteCheckpointBodySchema } from "@/lib/schemas/completions";
import {
  challenges,
  challenge_checkpoints,
  checkpoint_completions,
  participants,
} from "@/lib/db/schema";
import { recomputeCheckpointProgress } from "@/lib/db/checkpoints";
import { verifyLikeForTarget } from "@/lib/nostr/verify-like";
import { verifyHashtagPost } from "@/lib/nostr/verify-hashtag-post";
import { pickVerificationMethod, shouldAutoApprove } from "@/lib/api/verification-methods";
import { createNotification } from "@/lib/notifications";
import type { VerificationMethod } from "@/lib/types";

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

  const { content, image_url, method } = await parseBody(
    req,
    CompleteCheckpointBodySchema
  );

  const allowedMethods = checkpoint.verification_methods as VerificationMethod[];
  const selectedMethod = pickVerificationMethod(method, allowedMethods);

  let resolvedContent: string | null = null;
  let resolvedImageUrl: string | null = null;
  let proofEventId: string | null = null;
  let autoApprove = false;

  if (selectedMethod === "nostr_action") {
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
  } else if (selectedMethod === "nostr_hashtag") {
    if (!checkpoint.nostr_hashtag) {
      throw new BadRequestError("Checkpoint is missing a hashtag");
    }
    const result = await verifyHashtagPost({
      authorPubkey: session!.nostr_pubkey,
      hashtag: checkpoint.nostr_hashtag,
    });
    if (!result.valid || !result.proofEventId) {
      throw new BadRequestError(
        "No matching nostr note with that hashtag was found on your relays"
      );
    }
    proofEventId = result.proofEventId;
    autoApprove = true;
  } else {
    // Manual proof: either a ≥ 5-char text, an image, or both. Short
    // text alongside an image is silently dropped (the image itself is
    // evidence) — same rule as /api/challenges/[id]/completions so the
    // two submission surfaces behave identically.
    const textOk = !!content && content.trim().length >= 5;
    if (!textOk && !image_url) {
      throw new BadRequestError(
        "Provide at least a 5-character description or an image proof"
      );
    }
    resolvedContent = textOk ? content!.trim() : null;
    resolvedImageUrl = image_url ?? null;
    autoApprove = shouldAutoApprove(
      selectedMethod,
      challenge.creator_id,
      session!.user_id
    );
  }

  // If a previous row exists for this (participant, checkpoint) we
  // branch: approved is final, pending is under review (no double-
  // submit), rejected is a retry → update in place so sequential mode
  // can unlock downstream checkpoints once the creator re-approves.
  const [existing] = await db
    .select()
    .from(checkpoint_completions)
    .where(
      and(
        eq(checkpoint_completions.participant_id, participation.id),
        eq(checkpoint_completions.checkpoint_id, checkpoint.id)
      )
    )
    .limit(1);

  let completion: typeof checkpoint_completions.$inferSelect;
  if (existing) {
    if (existing.status === "approved") {
      throw new BadRequestError("This checkpoint is already completed");
    }
    if (existing.status === "pending") {
      throw new BadRequestError(
        "You already submitted this checkpoint — waiting for review"
      );
    }
    // rejected — rewrite the row with the fresh proof, clear the
    // creator's old reject_reason so the retry doesn't carry a stale
    // note from the previous rejection.
    [completion] = await db
      .update(checkpoint_completions)
      .set({
        content: resolvedContent,
        image_url: resolvedImageUrl,
        proof_event_id: proofEventId,
        status: autoApprove ? "approved" : "pending",
        reject_reason: null,
        completed_at: autoApprove ? new Date() : null,
      })
      .where(eq(checkpoint_completions.id, existing.id))
      .returning();
  } else {
    try {
      [completion] = await db
        .insert(checkpoint_completions)
        .values({
          participant_id: participation.id,
          checkpoint_id: checkpoint.id,
          content: resolvedContent,
          image_url: resolvedImageUrl,
          proof_event_id: proofEventId,
          status: autoApprove ? "approved" : "pending",
          completed_at: autoApprove ? new Date() : null,
        })
        .returning();
    } catch (err) {
      // Concurrent submit from the same participant — the unique index
      // protects us even though we checked for `existing` above.
      if (isUniqueViolation(err)) {
        throw new BadRequestError("This checkpoint is already completed");
      }
      throw err;
    }
  }

  if (autoApprove) {
    await recomputeCheckpointProgress(db, participation.id, params.id);
  } else {
    // Pending creator review: ping the creator so they know there's a
    // submission waiting. Notification failures must not roll back the
    // insert — bell is cosmetic.
    if (challenge.creator_id !== session!.user_id) {
      try {
        await createNotification(
          challenge.creator_id,
          "checkpoint_submitted",
          "New checkpoint proof to review",
          `A participant submitted proof for "${checkpoint.title}" on "${challenge.title}".`,
          {
            challenge_id: challenge.id,
            challenge_title: challenge.title,
            checkpoint_id: checkpoint.id,
            checkpoint_title: checkpoint.title,
            checkpoint_completion_id: completion.id,
          }
        );
      } catch (err) {
        console.error("notification:checkpoint_submitted failed", err);
      }
    }
  }

  return new CreatedResponse(completion);
});
