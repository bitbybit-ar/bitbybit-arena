import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { NotFoundError, ConflictError, BadRequestError } from "@/lib/api/errors";
import { challenges, participants } from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications";

// POST /api/challenges/[id]/join — join a challenge
export const POST = apiHandler(async (_req: NextRequest, { session, db, params }) => {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);

  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.status !== "open" && challenge.status !== "in_progress") {
    throw new BadRequestError("This challenge is not accepting participants");
  }

  // Check if already joined (including withdrawn — allow rejoin)
  const [existing] = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.challenge_id, params.id),
        eq(participants.user_id, session!.user_id)
      )
    )
    .limit(1);

  if (existing && existing.status !== "withdrawn") {
    throw new ConflictError("You have already joined this challenge");
  }

  if (existing && existing.status === "withdrawn") {
    // Rejoin: reactivate
    const [rejoined] = await db
      .update(participants)
      .set({ status: "active", progress: 0, points: 0, completed_at: null, joined_at: new Date() })
      .where(eq(participants.id, existing.id))
      .returning();
    return rejoined;
  }

  const [participant] = await db
    .insert(participants)
    .values({
      challenge_id: params.id,
      user_id: session!.user_id,
    })
    .returning();

  // Notify the creator that someone joined — but not when the creator
  // joins their own challenge (that's not signal, it's self-talk).
  if (challenge.creator_id !== session!.user_id) {
    try {
      await createNotification(
        challenge.creator_id,
        "challenge_joined",
        "New participant",
        `${session!.display_name} joined your challenge "${challenge.title}".`,
        { name: session!.display_name, challenge: challenge.title, challenge_id: challenge.id }
      );
    } catch (err) {
      console.error("notification:challenge_joined failed", err);
    }
  }

  return new CreatedResponse(participant);
});

// DELETE /api/challenges/[id]/join — withdraw from a challenge
export const DELETE = apiHandler(async (_req: NextRequest, { session, db, params }) => {
  const [existing] = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.challenge_id, params.id),
        eq(participants.user_id, session!.user_id)
      )
    )
    .limit(1);

  if (!existing) throw new NotFoundError("Participation");
  if (existing.status === "withdrawn") throw new BadRequestError("Already withdrawn");
  if (existing.status === "completed") throw new BadRequestError("Cannot withdraw from a completed challenge");

  const [updated] = await db
    .update(participants)
    .set({ status: "withdrawn" })
    .where(eq(participants.id, existing.id))
    .returning();

  return updated;
});
