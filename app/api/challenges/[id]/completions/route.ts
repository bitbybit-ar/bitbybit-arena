import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/lib/api/errors";
import { challenges, participants, completions, users } from "@/lib/db/schema";
import { verifyLikeForTarget } from "@/lib/nostr/verify-like";
import { verifyHashtagPost } from "@/lib/nostr/verify-hashtag-post";
import { pickVerificationMethod, shouldAutoApprove } from "@/lib/api/verification-methods";
import { validateHttpUrl } from "@/lib/api/validate-http-url";
import type { VerificationMethod } from "@/lib/types";

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybeCode = (err as { code?: unknown }).code;
  if (maybeCode === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    return (cause as { code?: unknown }).code === "23505";
  }
  return false;
}

// GET /api/challenges/[id]/completions — list completions
export const GET = apiHandler(
  async (req: NextRequest, { db, params }) => {
    const url = req.nextUrl;
    const status = url.searchParams.get("status");

    const conditions = [eq(completions.challenge_id, params.id)];
    if (status) conditions.push(eq(completions.status, status));

    const rows = await db
      .select({
        completion: completions,
        user: {
          id: users.id,
          username: users.username,
          display_name: users.display_name,
          avatar_url: users.avatar_url,
          nostr_pubkey: users.nostr_pubkey,
        },
      })
      .from(completions)
      .innerJoin(users, eq(completions.user_id, users.id))
      .where(and(...conditions))
      .orderBy(completions.submitted_at);

    return rows.map((row) => ({
      ...row.completion,
      user: row.user,
    }));
  },
  { requireAuth: false }
);

// POST /api/challenges/[id]/completions — submit text proof
export const POST = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);

  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.status === "cancelled") throw new BadRequestError("This challenge has been cancelled");
  if (challenge.status === "completed") throw new BadRequestError("This challenge is already completed");

  // Must be an active participant
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

  if (!participation) throw new ForbiddenError("You must join this challenge first");

  const body = await req.json().catch(() => ({}));
  const { content, image_url, step, method } = body as {
    content?: unknown;
    image_url?: unknown;
    step?: unknown;
    method?: unknown;
  };

  const resolvedImageUrl = validateHttpUrl(image_url, "image_url");

  const allowedMethods = challenge.verification_methods as VerificationMethod[];
  const selectedMethod = pickVerificationMethod(method, allowedMethods);

  let proofEventId: string | null = null;
  let resolvedContent: string | null = null;
  let autoApprove = false;

  if (selectedMethod === "nostr_action") {
    if (!challenge.nostr_action_target_event_id) {
      throw new BadRequestError("Challenge is missing a target event id");
    }
    const result = await verifyLikeForTarget({
      likerPubkey: session!.nostr_pubkey,
      targetEventId: challenge.nostr_action_target_event_id,
    });
    if (!result.valid || !result.proofEventId) {
      throw new BadRequestError("Like not found on Nostr relays for the target event");
    }
    proofEventId = result.proofEventId;
    autoApprove = true;
  } else if (selectedMethod === "nostr_hashtag") {
    if (!challenge.nostr_hashtag) {
      throw new BadRequestError("Challenge is missing a hashtag");
    }
    const result = await verifyHashtagPost({
      authorPubkey: session!.nostr_pubkey,
      hashtag: challenge.nostr_hashtag,
    });
    if (!result.valid || !result.proofEventId) {
      throw new BadRequestError(
        "No matching nostr note with that hashtag was found on your relays"
      );
    }
    proofEventId = result.proofEventId;
    autoApprove = true;
  } else {
    // Manual proofs accept text, an image, or both. When an image is
    // attached we relax the min-length on text since a photo is itself
    // evidence.
    const textOk =
      typeof content === "string" && content.trim().length >= 5;
    if (!textOk && !resolvedImageUrl) {
      throw new BadRequestError(
        "Provide at least a 5-character description or an image proof"
      );
    }
    resolvedContent = textOk ? (content as string).trim() : null;
    autoApprove = shouldAutoApprove(
      selectedMethod,
      challenge.creator_id,
      session!.user_id
    );
  }

  let completion;
  try {
    [completion] = await db
      .insert(completions)
      .values({
        challenge_id: params.id,
        user_id: session!.user_id,
        content: resolvedContent,
        image_url: resolvedImageUrl,
        proof_event_id: proofEventId,
        step: typeof step === "number" ? step : null,
        status: autoApprove ? "approved" : "pending",
        reviewed_at: autoApprove ? new Date() : null,
      })
      .returning();
  } catch (err) {
    // Postgres unique_violation: the partial unique index on
    // (challenge_id, user_id, proof_event_id) caught a duplicate proof
    // for the same like event. Close the race between two concurrent
    // "Verify my like" clicks. Drizzle wraps Neon errors in a
    // DrizzleQueryError so we check both the wrapper and its cause.
    if (isUniqueViolation(err)) {
      throw new BadRequestError("This like has already been submitted as a proof");
    }
    throw err;
  }

  if (autoApprove) {
    const newProgress = participation.progress + 1;
    const isComplete = challenge.goal ? newProgress >= challenge.goal : true;

    await db
      .update(participants)
      .set({
        progress: newProgress,
        ...(isComplete ? { status: "completed" as const, completed_at: new Date() } : {}),
      })
      .where(eq(participants.id, participation.id));
  }

  return new CreatedResponse(completion);
});
