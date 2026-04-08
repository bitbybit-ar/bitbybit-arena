import { NextRequest } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { participants, users } from "@/lib/db/schema";

// GET /api/challenges/[id]/participants — list participants
export const GET = apiHandler(
  async (_req: NextRequest, { db, params }) => {
    const rows = await db
      .select({
        participant: participants,
        user: {
          id: users.id,
          username: users.username,
          display_name: users.display_name,
          avatar_url: users.avatar_url,
          nostr_pubkey: users.nostr_pubkey,
        },
      })
      .from(participants)
      .innerJoin(users, eq(participants.user_id, users.id))
      .where(
        and(
          eq(participants.challenge_id, params.id),
          ne(participants.status, "withdrawn")
        )
      )
      .orderBy(participants.joined_at);

    return rows.map((row) => ({
      ...row.participant,
      user: row.user,
    }));
  },
  { requireAuth: false }
);
