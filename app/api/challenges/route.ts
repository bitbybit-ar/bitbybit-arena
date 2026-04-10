import { NextRequest } from "next/server";
import { eq, and, ilike, or, sql, desc, asc } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
import { challenges, challenge_checkpoints, users } from "@/lib/db/schema";
import { slugify } from "@/lib/utils";
import type {
  ChallengeType,
  VerificationType,
  PrizeDistribution,
  CheckpointMode,
} from "@/lib/types";

const VALID_TYPES: ChallengeType[] = ["one_time", "streak", "competition", "race", "creative"];
const VALID_VERIFICATION: VerificationType[] = ["creator_approval", "automatic", "nostr_action"];
const VALID_DISTRIBUTION: PrizeDistribution[] = ["first_to_complete", "winner_takes_all", "split", "none"];
const VALID_CHECKPOINT_MODE: CheckpointMode[] = ["none", "sequential", "parallel"];
const HEX_64 = /^[0-9a-f]{64}$/i;

interface CheckpointInput {
  title: string;
  description?: string | null;
  verification_type?: VerificationType;
  nostr_action_target_event_id?: string | null;
}

function normalizeCheckpoints(raw: unknown): CheckpointInput[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestError("checkpoints must be an array");
  }
  if (raw.length === 0) {
    throw new BadRequestError("checkpoint_mode is set but checkpoints is empty");
  }
  if (raw.length > 20) {
    throw new BadRequestError("A challenge can have at most 20 checkpoints");
  }
  return raw.map((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new BadRequestError(`Checkpoint #${idx + 1} must be an object`);
    }
    const obj = item as Record<string, unknown>;
    const title = obj.title;
    if (typeof title !== "string" || title.trim().length < 3) {
      throw new BadRequestError(`Checkpoint #${idx + 1}: title must be at least 3 characters`);
    }
    const verification = (obj.verification_type as VerificationType | undefined) ?? "creator_approval";
    if (!VALID_VERIFICATION.includes(verification)) {
      throw new BadRequestError(`Checkpoint #${idx + 1}: invalid verification_type`);
    }
    let targetEventId: string | null = null;
    if (verification === "nostr_action") {
      const raw = obj.nostr_action_target_event_id;
      if (typeof raw !== "string" || !HEX_64.test(raw)) {
        throw new BadRequestError(
          `Checkpoint #${idx + 1}: nostr_action requires a 64-character hex event id`
        );
      }
      targetEventId = raw.toLowerCase();
    }
    return {
      title: title.trim(),
      description:
        typeof obj.description === "string" && obj.description.trim().length > 0
          ? obj.description.trim()
          : null,
      verification_type: verification,
      nostr_action_target_event_id: targetEventId,
    };
  });
}
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

  const { title, description, type, category, goal, unit, verification_type, nostr_action_target_event_id, checkpoint_mode, checkpoints: checkpointsInput, prize_amount_sats, prize_distribution, badge_name, starts_at, ends_at } = body;

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

  const resolvedVerification: VerificationType = verification_type || "creator_approval";
  let resolvedTargetEventId: string | null = null;
  if (resolvedVerification === "nostr_action") {
    if (typeof nostr_action_target_event_id !== "string" || !HEX_64.test(nostr_action_target_event_id)) {
      throw new BadRequestError("nostr_action_target_event_id must be a 64-character hex event id");
    }
    resolvedTargetEventId = nostr_action_target_event_id.toLowerCase();
  }

  const resolvedMode: CheckpointMode = (checkpoint_mode as CheckpointMode) || "none";
  if (!VALID_CHECKPOINT_MODE.includes(resolvedMode)) {
    throw new BadRequestError(
      `Invalid checkpoint_mode. Must be one of: ${VALID_CHECKPOINT_MODE.join(", ")}`
    );
  }
  const normalizedCheckpoints =
    resolvedMode === "none" ? [] : normalizeCheckpoints(checkpointsInput);

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
      // When checkpoints are used, goal is the number of checkpoints and
      // unit is always "checkpoints" so participant.progress compares
      // directly against checkpoint count.
      goal: normalizedCheckpoints.length > 0 ? normalizedCheckpoints.length : goal || null,
      unit: normalizedCheckpoints.length > 0 ? "checkpoints" : unit || null,
      verification_type: resolvedVerification,
      nostr_action_target_event_id: resolvedTargetEventId,
      checkpoint_mode: resolvedMode,
      prize_amount_sats: prize_amount_sats || 0,
      prize_distribution: prize_distribution || "none",
      badge_name: badge_name || null,
      starts_at: starts_at ? new Date(starts_at) : null,
      ends_at: ends_at ? new Date(ends_at) : null,
    })
    .returning();

  if (normalizedCheckpoints.length > 0) {
    await db.insert(challenge_checkpoints).values(
      normalizedCheckpoints.map((cp, idx) => ({
        challenge_id: challenge.id,
        order: idx,
        title: cp.title,
        description: cp.description ?? null,
        verification_type: cp.verification_type ?? "creator_approval",
        nostr_action_target_event_id: cp.nostr_action_target_event_id ?? null,
      }))
    );
  }

  return new CreatedResponse(challenge);
});
