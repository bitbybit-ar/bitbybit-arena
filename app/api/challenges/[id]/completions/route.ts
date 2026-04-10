import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/lib/api/errors";
import { challenges, participants, completions, users } from "@/lib/db/schema";
import { verifyLikeForTarget } from "@/lib/nostr/verify-like";

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
  const { content, step } = body as { content?: unknown; step?: unknown };

  let proofEventId: string | null = null;
  let resolvedContent: string | null = null;
  let autoApprove = false;

  if (challenge.verification_type === "nostr_action") {
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

    // Reject duplicate proofs for the same like event.
    const [existing] = await db
      .select({ id: completions.id })
      .from(completions)
      .where(
        and(
          eq(completions.challenge_id, params.id),
          eq(completions.user_id, session!.user_id),
          eq(completions.proof_event_id, proofEventId)
        )
      )
      .limit(1);
    if (existing) {
      throw new BadRequestError("This like has already been submitted as a proof");
    }
  } else {
    if (!content || typeof content !== "string" || content.trim().length < 5) {
      throw new BadRequestError("Proof content must be at least 5 characters");
    }
    resolvedContent = content.trim();
    autoApprove = challenge.verification_type === "automatic";
  }

  const [completion] = await db
    .insert(completions)
    .values({
      challenge_id: params.id,
      user_id: session!.user_id,
      content: resolvedContent,
      proof_event_id: proofEventId,
      step: typeof step === "number" ? step : null,
      status: autoApprove ? "approved" : "pending",
      reviewed_at: autoApprove ? new Date() : null,
    })
    .returning();

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
