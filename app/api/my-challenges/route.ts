import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { MyChallengesQuerySchema } from "@/lib/schemas/challenges";
import { challenges, participants } from "@/lib/db/schema";

// GET /api/my-challenges — challenges I created + joined
export const GET = apiHandler(async (req: NextRequest, { session, db }) => {
  const { scope } = parseQuery(req, MyChallengesQuerySchema);

  const userId = session!.user_id;

  // Challenges I created
  const getCreated = async () => {
    if (scope === "joined") return [];
    return db
      .select({
        challenge: challenges,
        participant_count: sql<number>`(
          SELECT COUNT(*)::int FROM participants
          WHERE participants.challenge_id = ${challenges.id}
          AND participants.status != 'withdrawn'
        )`,
        role: sql<string>`'creator'`,
      })
      .from(challenges)
      .where(eq(challenges.creator_id, userId))
      .orderBy(challenges.created_at);
  };

  // Challenges I joined. For challenges with checkpoints we return the
  // per-participant approved/pending/total counts so the list card can
  // render "X/Y checkpoints" without a second round-trip per row.
  const getJoined = async () => {
    if (scope === "created") return [];
    return db
      .select({
        challenge: challenges,
        participant_count: sql<number>`(
          SELECT COUNT(*)::int FROM participants
          WHERE participants.challenge_id = ${challenges.id}
          AND participants.status != 'withdrawn'
        )`,
        checkpoints_total: sql<number>`(
          SELECT COUNT(*)::int FROM challenge_checkpoints
          WHERE challenge_checkpoints.challenge_id = ${challenges.id}
        )`,
        checkpoints_approved: sql<number>`(
          SELECT COUNT(*)::int FROM checkpoint_completions
          WHERE checkpoint_completions.participant_id = ${participants.id}
          AND checkpoint_completions.status = 'approved'
        )`,
        checkpoints_pending: sql<number>`(
          SELECT COUNT(*)::int FROM checkpoint_completions
          WHERE checkpoint_completions.participant_id = ${participants.id}
          AND checkpoint_completions.status = 'pending'
        )`,
        participation: participants,
        role: sql<string>`'participant'`,
      })
      .from(participants)
      .innerJoin(challenges, eq(participants.challenge_id, challenges.id))
      .where(eq(participants.user_id, userId))
      .orderBy(participants.joined_at);
  };

  const [created, joined] = await Promise.all([getCreated(), getJoined()]);

  return {
    created: created.map((row) => ({
      ...row.challenge,
      participant_count: row.participant_count,
      role: "creator",
    })),
    joined: joined.map((row) => ({
      ...row.challenge,
      participant_count: row.participant_count,
      checkpoints_total: row.checkpoints_total,
      checkpoints_approved: row.checkpoints_approved,
      checkpoints_pending: row.checkpoints_pending,
      participation: "participation" in row ? row.participation : null,
      role: "participant",
    })),
  };
});
