import { NextRequest } from "next/server";
import { eq, and, ilike, or, sql, desc, asc } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
import { challenges, participants, users } from "@/lib/db/schema";
import { slugify } from "@/lib/utils";
import type { ChallengeType, VerificationType, PrizeDistribution } from "@/lib/types";

const VALID_TYPES: ChallengeType[] = ["one_time", "streak", "competition", "race", "creative"];
const VALID_VERIFICATION: VerificationType[] = ["creator_approval", "automatic"];
const VALID_DISTRIBUTION: PrizeDistribution[] = ["first_to_complete", "winner_takes_all", "split", "none"];
const VALID_SORT = ["newest", "ending_soon", "most_participants", "most_active"] as const;

// GET /api/challenges — list with search, filters, sort, pagination
export const GET = apiHandler(
  async (req: NextRequest, { db }) => {
    const url = req.nextUrl;
    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const category = url.searchParams.get("category");
    const verification = url.searchParams.get("verification");
    const sort = url.searchParams.get("sort") || "newest";
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);

    const conditions = [];

    if (status) conditions.push(eq(challenges.status, status));
    if (type) conditions.push(eq(challenges.type, type));
    if (category) conditions.push(eq(challenges.category, category));
    if (verification) conditions.push(eq(challenges.verification_type, verification));
    if (search) {
      conditions.push(
        or(
          ilike(challenges.title, `%${search}%`),
          ilike(challenges.description, `%${search}%`)
        )
      );
    }
    if (cursor) {
      conditions.push(sql`${challenges.created_at} < ${cursor}`);
    }

    let orderBy;
    switch (sort) {
      case "ending_soon":
        orderBy = asc(challenges.ends_at);
        break;
      case "most_participants":
        orderBy = desc(challenges.created_at); // Will sort after join
        break;
      case "most_active":
        orderBy = desc(challenges.updated_at);
        break;
      default:
        orderBy = desc(challenges.created_at);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        challenge: challenges,
        creator: {
          id: users.id,
          username: users.username,
          display_name: users.display_name,
          avatar_url: users.avatar_url,
          nostr_pubkey: users.nostr_pubkey,
        },
        participant_count: sql<number>`(
          SELECT COUNT(*)::int FROM participants
          WHERE participants.challenge_id = ${challenges.id}
          AND participants.status != 'withdrawn'
        )`,
      })
      .from(challenges)
      .innerJoin(users, eq(challenges.creator_id, users.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => ({
      ...row.challenge,
      participant_count: row.participant_count,
      creator: row.creator,
    }));

    const nextCursor = hasMore
      ? items[items.length - 1].created_at?.toISOString()
      : null;

    return { items, nextCursor };
  },
  { requireAuth: false }
);

// POST /api/challenges — create a new challenge
export const POST = apiHandler(async (req: NextRequest, { session, db }) => {
  const body = await req.json();

  const { title, description, type, category, goal, unit, verification_type, prize_amount_sats, prize_distribution, badge_name, starts_at, ends_at } = body;

  if (!title || typeof title !== "string" || title.trim().length < 3) {
    throw new BadRequestError("Title must be at least 3 characters");
  }
  if (!description || typeof description !== "string" || description.trim().length < 10) {
    throw new BadRequestError("Description must be at least 10 characters");
  }
  if (type && !VALID_TYPES.includes(type)) {
    throw new BadRequestError(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
  }
  if (verification_type && !VALID_VERIFICATION.includes(verification_type)) {
    throw new BadRequestError(`Invalid verification type. Must be one of: ${VALID_VERIFICATION.join(", ")}`);
  }
  if (prize_distribution && !VALID_DISTRIBUTION.includes(prize_distribution)) {
    throw new BadRequestError(`Invalid prize distribution. Must be one of: ${VALID_DISTRIBUTION.join(", ")}`);
  }

  const slug = slugify(title);

  const [challenge] = await db
    .insert(challenges)
    .values({
      creator_id: session!.user_id,
      slug,
      title: title.trim(),
      description: description.trim(),
      type: type || "one_time",
      category: category || null,
      goal: goal || null,
      unit: unit || null,
      verification_type: verification_type || "creator_approval",
      prize_amount_sats: prize_amount_sats || 0,
      prize_distribution: prize_distribution || "none",
      badge_name: badge_name || null,
      starts_at: starts_at ? new Date(starts_at) : null,
      ends_at: ends_at ? new Date(ends_at) : null,
    })
    .returning();

  return new CreatedResponse(challenge);
});
