import { NextRequest } from "next/server";
import { eq, desc, and, sql } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
import { badges, challenges, users } from "@/lib/db/schema";

// GET /api/my-badges — list the current user's earned badges joined with
// their parent challenge and issuing creator. Powers the Achievements tab
// on /my-challenges. Ordered by most recently awarded first.
//
// Cursor-based pagination matches /api/challenges. The cursor is the ISO
// timestamp of the last badge in the previous page; subsequent queries
// return only rows with awarded_at < cursor. Default limit 20, capped 50.
export const GET = apiHandler(async (req: NextRequest, { session, db }) => {
  const userId = session!.user_id;
  const url = req.nextUrl;
  const cursor = url.searchParams.get("cursor");
  const rawLimit = Number(url.searchParams.get("limit")) || 20;
  const limit = Math.max(1, Math.min(rawLimit, 50));

  if (cursor && Number.isNaN(new Date(cursor).getTime())) {
    throw new BadRequestError(
      "cursor must be a valid ISO-8601 timestamp"
    );
  }

  const conditions = [eq(badges.user_id, userId)];
  if (cursor) {
    conditions.push(sql`${badges.awarded_at} < ${cursor}`);
  }

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
    .where(and(...conditions))
    .orderBy(desc(badges.awarded_at))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    ...row.badge,
    challenge: row.challenge,
    issuer: row.issuer,
  }));

  const lastBadge = items[items.length - 1]?.awarded_at;
  const nextCursor =
    hasMore && lastBadge ? lastBadge.toISOString() : null;

  return { items, nextCursor };
});
