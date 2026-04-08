import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/lib/api/errors";
import { challenges, participants, completions, users } from "@/lib/db/schema";

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

  const body = await req.json();
  const { content, step } = body;

  if (!content || typeof content !== "string" || content.trim().length < 5) {
    throw new BadRequestError("Proof content must be at least 5 characters");
  }

  // For automatic verification, auto-approve
  const autoApprove = challenge.verification_type === "automatic";

  const [completion] = await db
    .insert(completions)
    .values({
      challenge_id: params.id,
      user_id: session!.user_id,
      content: content.trim(),
      step: step || null,
      status: autoApprove ? "approved" : "pending",
      reviewed_at: autoApprove ? new Date() : null,
    })
    .returning();

  // If auto-approved, update participant progress
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
