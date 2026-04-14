import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { badges, challenges, users } from "@/lib/db/schema";

// GET /api/my-badges — list the current user's earned badges joined with
// their parent challenge and issuing creator. Powers the Achievements tab
// on /my-challenges. Ordered by most recently awarded first.
export const GET = apiHandler(async (_req: NextRequest, { session, db }) => {
  const userId = session!.user_id;

  const rows = await db
    .select({
      badge: badges,
      challenge: {
        id: challenges.id,
        slug: challenges.slug,
        title: challenges.title,
        badge_nostr_event_id: challenges.badge_nostr_event_id,
      },
      issuer: {
        id: users.id,
        display_name: users.display_name,
        username: users.username,
        nostr_pubkey: users.nostr_pubkey,
      },
    })
    .from(badges)
    .innerJoin(challenges, eq(badges.challenge_id, challenges.id))
    .innerJoin(users, eq(challenges.creator_id, users.id))
    .where(eq(badges.user_id, userId))
    .orderBy(desc(badges.awarded_at));

  return rows.map((row) => ({
    ...row.badge,
    challenge: row.challenge,
    issuer: row.issuer,
  }));
});
