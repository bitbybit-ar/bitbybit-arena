import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/lib/api/errors";
import { completions, challenges, participants } from "@/lib/db/schema";

// POST /api/completions/[id]/verify — creator approves or rejects a completion
export const POST = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const body = await req.json();
  const { status } = body;

  if (!status || !["approved", "rejected"].includes(status)) {
    throw new BadRequestError("Status must be 'approved' or 'rejected'");
  }

  const [completion] = await db
    .select()
    .from(completions)
    .where(eq(completions.id, params.id))
    .limit(1);

  if (!completion) throw new NotFoundError("Completion");
  if (completion.status !== "pending") throw new BadRequestError("This completion has already been reviewed");

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, completion.challenge_id))
    .limit(1);

  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.creator_id !== session!.user_id) {
    throw new ForbiddenError("Only the challenge creator can verify completions");
  }

  const [updated] = await db
    .update(completions)
    .set({
      status,
      reviewed_by: session!.user_id,
      reviewed_at: new Date(),
    })
    .where(eq(completions.id, params.id))
    .returning();

  // If approved, update participant progress
  if (status === "approved") {
    const [participation] = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.challenge_id, challenge.id),
          eq(participants.user_id, completion.user_id)
        )
      )
      .limit(1);

    if (participation) {
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
  }

  return updated;
});
