import { NextRequest } from "next/server";
import { eq, sql, or } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { challenges, participants } from "@/lib/db/schema";

// GET /api/my-challenges — challenges I created + joined
export const GET = apiHandler(async (req: NextRequest, { session, db }) => {
  const url = req.nextUrl;
  const scope = url.searchParams.get("scope"); // "created" | "joined" | null (both)

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

  // Challenges I joined
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
      participation: "participation" in row ? row.participation : null,
      role: "participant",
    })),
  };
});
