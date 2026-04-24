import { NextRequest } from "next/server";
import { eq, sql, and, asc } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { NotFoundError, BadRequestError } from "@/lib/api/errors";
import {
  fetchChallengeWithCounts,
  findResourceOrOwn,
  findParticipation,
} from "@/lib/api/db-helpers";
import { UpdateChallengeBodySchema } from "@/lib/schemas/challenges";
import {
  challenges,
  participants,
  challenge_checkpoints,
  checkpoint_completions,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth";

// GET /api/challenges/[id] — get single challenge with creator and participant count
export const GET = apiHandler(
  async (_req: NextRequest, { db, params }) => {
    const challenge = await fetchChallengeWithCounts(db, params.id);
    if (!challenge) throw new NotFoundError("Challenge");

    const checkpoints = await db
      .select()
      .from(challenge_checkpoints)
      .where(eq(challenge_checkpoints.challenge_id, params.id))
      .orderBy(asc(challenge_checkpoints.order));

    // Current user's checkpoint completions, if they are a participant.
    const session = await getSession();
    let myCheckpointCompletions: (typeof checkpoint_completions.$inferSelect)[] = [];
    if (session && checkpoints.length > 0) {
      const myParticipation = await findParticipation(db, params.id, session.user_id);
      if (myParticipation) {
        myCheckpointCompletions = await db
          .select()
          .from(checkpoint_completions)
          .where(eq(checkpoint_completions.participant_id, myParticipation.id));
      }
    }

    return {
      ...challenge,
      checkpoints,
      my_checkpoint_completions: myCheckpointCompletions,
    };
  },
  { requireAuth: false }
);

// PUT /api/challenges/[id] — update (creator only)
export const PUT = apiHandler(async (req: NextRequest, { session, db, params }) => {
  await findResourceOrOwn(db, challenges, params.id, {
    resourceName: "Challenge",
    ownerField: "creator_id",
    session: session!,
    forbiddenMessage: "Only the creator can edit this challenge",
  });

  // Parsed body only contains the keys the client actually sent —
  // Zod strips missing optionals — so spreading directly into the
  // update set preserves PATCH-style semantics. `null` values for
  // nullish fields (e.g. `badge_name: null`) survive the spread and
  // clear the column as intended.
  const updates = await parseBody(req, UpdateChallengeBodySchema);

  const [updated] = await db
    .update(challenges)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(challenges.id, params.id))
    .returning();

  return updated;
});

// DELETE /api/challenges/[id] — delete (creator only, no active participants)
export const DELETE = apiHandler(async (_req: NextRequest, { session, db, params }) => {
  await findResourceOrOwn(db, challenges, params.id, {
    resourceName: "Challenge",
    ownerField: "creator_id",
    session: session!,
    forbiddenMessage: "Only the creator can delete this challenge",
  });

  const [activeCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(participants)
    .where(
      and(
        eq(participants.challenge_id, params.id),
        eq(participants.status, "active")
      )
    );

  if (activeCount.count > 0) {
    throw new BadRequestError("Cannot delete a challenge with active participants");
  }

  await db.delete(challenges).where(eq(challenges.id, params.id));

  return { deleted: true };
});
