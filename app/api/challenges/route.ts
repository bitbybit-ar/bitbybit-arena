import { NextRequest } from "next/server";
import { eq, and, ilike, inArray, or, sql, desc, asc } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
import { normalizeTags } from "@/lib/api/normalize-tags";
import { validateHttpUrl } from "@/lib/api/validate-http-url";
import { challenges, challenge_checkpoints, users } from "@/lib/db/schema";
import { slugify } from "@/lib/utils";
import type {
  ChallengeType,
  VerificationMethod,
  PrizeDistribution,
  CheckpointMode,
} from "@/lib/types";

const VALID_TYPES: ChallengeType[] = ["one_time", "streak", "competition", "race", "creative"];
const VALID_VERIFICATION: VerificationMethod[] = [
  "creator_approval",
  "automatic",
  "nostr_action",
  "nostr_hashtag",
];
const VALID_DISTRIBUTION: PrizeDistribution[] = ["first_to_complete", "split", "tiered", "none"];
const PAYOUT_DISTRIBUTIONS: PrizeDistribution[] = ["first_to_complete", "split", "tiered"];
const VALID_CHECKPOINT_MODE: CheckpointMode[] = ["none", "sequential", "parallel"];
const HEX_64 = /^[0-9a-f]{64}$/i;
const HASHTAG = /^[a-z0-9_]{2,50}$/;
// Mirrors what slugify() in lib/utils.ts can produce — including the
// edge case of an empty base (e.g. an all-emoji title), which leaves
// the slug starting with the random suffix's leading dash.
const SLUG = /^[a-z0-9-]{1,100}$/;

function normalizeHashtag(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new BadRequestError("nostr_hashtag must be a string");
  }
  const cleaned = raw.trim().toLowerCase().replace(/^#/, "");
  if (!HASHTAG.test(cleaned)) {
    throw new BadRequestError(
      "nostr_hashtag must be 2-50 characters, letters/digits/underscore only"
    );
  }
  return cleaned;
}

function normalizeMethods(raw: unknown, field: string): VerificationMethod[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestError(`${field} must be a non-empty array`);
  }
  const seen = new Set<VerificationMethod>();
  for (const m of raw) {
    if (typeof m !== "string" || !VALID_VERIFICATION.includes(m as VerificationMethod)) {
      throw new BadRequestError(
        `${field} contains an invalid value. Must be one of: ${VALID_VERIFICATION.join(", ")}`
      );
    }
    seen.add(m as VerificationMethod);
  }
  return Array.from(seen);
}

interface CheckpointInput {
  title: string;
  description?: string | null;
  verification_methods: VerificationMethod[];
  nostr_action_target_event_id?: string | null;
  nostr_hashtag?: string | null;
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
    const methodsRaw = obj.verification_methods ?? ["creator_approval"];
    const methods = normalizeMethods(
      methodsRaw,
      `Checkpoint #${idx + 1}: verification_methods`
    );
    let targetEventId: string | null = null;
    let hashtag: string | null = null;
    if (methods.includes("nostr_action")) {
      const raw = obj.nostr_action_target_event_id;
      if (typeof raw !== "string" || !HEX_64.test(raw)) {
        throw new BadRequestError(
          `Checkpoint #${idx + 1}: nostr_action requires a 64-character hex event id`
        );
      }
      targetEventId = raw.toLowerCase();
    }
    if (methods.includes("nostr_hashtag")) {
      hashtag = normalizeHashtag(obj.nostr_hashtag);
    }
    return {
      title: title.trim(),
      description:
        typeof obj.description === "string" && obj.description.trim().length > 0
          ? obj.description.trim()
          : null,
      verification_methods: methods,
      nostr_action_target_event_id: targetEventId,
      nostr_hashtag: hashtag,
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
    const tag = url.searchParams.get("tag");
    const tagsParam = url.searchParams.get("tags");
    const verification = url.searchParams.get("verification");
    const sort = url.searchParams.get("sort") || "newest";
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
    const followPubkeysParam = url.searchParams.get("follow_pubkeys");
    const onlyFollowing = url.searchParams.get("only_following") === "true";

    const followPubkeys: string[] = followPubkeysParam
      ? followPubkeysParam
          .split(",")
          .map((p) => p.trim().toLowerCase())
          .filter((p) => HEX_64.test(p))
          .slice(0, 1000)
      : [];
    const useFollowBoost = followPubkeys.length > 0;

    // Pre-built `(?,?,…)` value list used in two places below. We can't
    // pass `${followPubkeys}` straight into a `sql\`\`` literal — Drizzle
    // serialises it as a comma-joined string and Postgres rejects it with
    // `malformed array literal`. `sql.join` expands each element as its
    // own bound parameter, which is also injection-safe.
    const followPubkeysSql = useFollowBoost
      ? sql.join(
          followPubkeys.map((pk) => sql`${pk}`),
          sql`, `
        )
      : sql`NULL`;

    // True when the row's creator OR any active participant matches the
    // logged-in user's follow list. Used for both the "boost to top" sort
    // and the only_following hard filter, so they stay in lockstep.
    const isFollowedSql = sql<boolean>`(
      ${users.nostr_pubkey} IN (${followPubkeysSql})
      OR EXISTS (
        SELECT 1 FROM participants p_f
        INNER JOIN users u_f ON u_f.id = p_f.user_id
        WHERE p_f.challenge_id = ${challenges.id}
          AND p_f.status != 'withdrawn'
          AND u_f.nostr_pubkey IN (${followPubkeysSql})
      )
    )`;

    const conditions = [];

    if (status) conditions.push(eq(challenges.status, status));
    if (type) {
      const allowedTypes = new Set([
        "one_time",
        "streak",
        "competition",
        "race",
        "creative",
      ]);
      const typeList = type
        .split(",")
        .map((t) => t.trim())
        .filter((t) => allowedTypes.has(t));
      if (typeList.length === 1) {
        conditions.push(eq(challenges.type, typeList[0]));
      } else if (typeList.length > 1) {
        conditions.push(inArray(challenges.type, typeList));
      }
    }
    if (tag) conditions.push(sql`${tag} = ANY(${challenges.tags})`);
    if (tagsParam) {
      const tagList = tagsParam
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => /^[a-z0-9-]{1,30}$/.test(t));
      if (tagList.length > 0) {
        const tagChecks = tagList.map(
          (t) => sql`${t} = ANY(${challenges.tags})`
        );
        const orClause = or(...tagChecks);
        if (orClause) conditions.push(orClause);
      }
    }
    if (verification) {
      // Match challenges whose methods array contains this method
      conditions.push(sql`${verification} = ANY(${challenges.verification_methods})`);
    }
    if (search) {
      conditions.push(
        or(
          ilike(challenges.title, `%${search}%`),
          ilike(challenges.description, `%${search}%`)
        )
      );
    }
    if (useFollowBoost && onlyFollowing) {
      conditions.push(isFollowedSql);
    }
    // Cursor pagination on created_at only applies when follow boost is
    // off — the boost makes ordering tiered (followed first), so we
    // switch to offset-based pagination there to keep things simple.
    if (!useFollowBoost && cursor) {
      conditions.push(sql`${challenges.created_at} < ${cursor}`);
    }

    // Active participant count — shared between the SELECT projection and
    // the most_participants sort so both see the exact same subquery.
    const participantCount = sql<number>`(
      SELECT COUNT(*)::int FROM participants
      WHERE participants.challenge_id = ${challenges.id}
      AND participants.status != 'withdrawn'
    )`;

    // Trending score: joins + 2 * completions within the last 7 days.
    // Completions weigh double because actually doing the thing is a stronger
    // signal than just joining. Tiebreak by created_at so newer challenges
    // bubble up when two have identical momentum.
    const trendingScore = sql<number>`(
      (SELECT COUNT(*)::int FROM participants
       WHERE participants.challenge_id = ${challenges.id}
         AND participants.status != 'withdrawn'
         AND participants.joined_at >= NOW() - INTERVAL '7 days')
      +
      (SELECT COUNT(*)::int FROM completions
       WHERE completions.challenge_id = ${challenges.id}
         AND completions.submitted_at >= NOW() - INTERVAL '7 days') * 2
    )`;

    let orderBy;
    switch (sort) {
      case "ending_soon":
        orderBy = asc(challenges.ends_at);
        break;
      case "most_participants":
        orderBy = [desc(participantCount), desc(challenges.created_at)];
        break;
      case "most_active":
        orderBy = desc(challenges.updated_at);
        break;
      case "trending":
        orderBy = [desc(trendingScore), desc(challenges.created_at)];
        break;
      default:
        orderBy = desc(challenges.created_at);
    }

    // When the caller passes a follow list, lift followed-creator and
    // followed-participant rows to the top of whichever sort they chose.
    // Skipped when only_following is on (every row is followed already).
    if (useFollowBoost && !onlyFollowing) {
      const orderByArr = Array.isArray(orderBy) ? orderBy : [orderBy];
      orderBy = [desc(isFollowedSql), ...orderByArr];
    }

    // When follow boost is active we can't use a created_at cursor
    // (the followed/not-followed boundary breaks monotonicity), so we
    // interpret `cursor` as an integer offset instead. Capped to keep
    // OFFSET scans bounded — past 10k rows the user should narrow with
    // search/filters anyway.
    const offset = useFollowBoost
      ? Math.min(10_000, Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0))
      : 0;

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
      .select({
        challenge: challenges,
        creator: {
          id: users.id,
          username: users.username,
          display_name: users.display_name,
          avatar_url: users.avatar_url,
          nostr_pubkey: users.nostr_pubkey,
        },
        participant_count: participantCount,
      })
      .from(challenges)
      .innerJoin(users, eq(challenges.creator_id, users.id))
      .where(where)
      .orderBy(...(Array.isArray(orderBy) ? orderBy : [orderBy]))
      .limit(limit + 1);

    const rows = useFollowBoost
      ? await baseQuery.offset(offset)
      : await baseQuery;

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => ({
      ...row.challenge,
      participant_count: row.participant_count,
      creator: row.creator,
    }));

    const nextCursor = hasMore
      ? useFollowBoost
        ? String(offset + limit)
        : items[items.length - 1].created_at?.toISOString()
      : null;

    return { items, nextCursor };
  },
  { requireAuth: false }
);

// POST /api/challenges — create a new challenge
export const POST = apiHandler(async (req: NextRequest, { session, db }) => {
  const body = await req.json();

  const { slug: slugInput, nostr_event_id: nostrEventIdInput, title, description, type, tags, goal, unit, verification_methods, nostr_action_target_event_id, nostr_hashtag, checkpoint_mode, checkpoints: checkpointsInput, prize_amount_sats, prize_distribution, zap_goal_event_id, badge_name, badge_image_url, starts_at, ends_at } = body;

  const resolvedTags = normalizeTags(tags);
  const resolvedBadgeImageUrl = validateHttpUrl(
    badge_image_url,
    "badge_image_url"
  );

  if (!title || typeof title !== "string" || title.trim().length < 3) {
    throw new BadRequestError("Title must be at least 3 characters");
  }
  if (!description || typeof description !== "string" || description.trim().length < 10) {
    throw new BadRequestError("Description must be at least 10 characters");
  }
  if (type && !VALID_TYPES.includes(type)) {
    throw new BadRequestError(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
  }
  if (prize_distribution && !VALID_DISTRIBUTION.includes(prize_distribution)) {
    throw new BadRequestError(`Invalid prize_distribution. Must be one of: ${VALID_DISTRIBUTION.join(", ")}`);
  }
  if (prize_amount_sats !== undefined && prize_amount_sats !== null) {
    if (typeof prize_amount_sats !== "number" || prize_amount_sats < 0) {
      throw new BadRequestError("prize_amount_sats must be a non-negative number");
    }
  }
  let resolvedZapGoalEventId: string | null = null;
  if (zap_goal_event_id !== undefined && zap_goal_event_id !== null) {
    if (
      typeof zap_goal_event_id !== "string" ||
      !HEX_64.test(zap_goal_event_id)
    ) {
      throw new BadRequestError(
        "zap_goal_event_id must be a 64-character hex event id"
      );
    }
    resolvedZapGoalEventId = zap_goal_event_id.toLowerCase();
  }
  if (
    (prize_amount_sats ?? 0) > 0 &&
    !PAYOUT_DISTRIBUTIONS.includes(prize_distribution as PrizeDistribution)
  ) {
    throw new BadRequestError(
      `prize_distribution must be one of ${PAYOUT_DISTRIBUTIONS.join(", ")} when prize_amount_sats > 0`
    );
  }

  const resolvedMethods: VerificationMethod[] = verification_methods
    ? normalizeMethods(verification_methods, "verification_methods")
    : ["creator_approval"];
  let resolvedTargetEventId: string | null = null;
  if (resolvedMethods.includes("nostr_action")) {
    if (
      typeof nostr_action_target_event_id !== "string" ||
      !HEX_64.test(nostr_action_target_event_id)
    ) {
      throw new BadRequestError(
        "nostr_action_target_event_id must be a 64-character hex event id"
      );
    }
    resolvedTargetEventId = nostr_action_target_event_id.toLowerCase();
  }
  let resolvedHashtag: string | null = null;
  if (resolvedMethods.includes("nostr_hashtag")) {
    resolvedHashtag = normalizeHashtag(nostr_hashtag);
  }

  if (
    checkpoint_mode !== undefined &&
    !VALID_CHECKPOINT_MODE.includes(checkpoint_mode as CheckpointMode)
  ) {
    throw new BadRequestError(
      `Invalid checkpoint_mode. Must be one of: ${VALID_CHECKPOINT_MODE.join(", ")}`
    );
  }
  const resolvedMode: CheckpointMode =
    (checkpoint_mode as CheckpointMode | undefined) ?? "none";
  const normalizedCheckpoints =
    resolvedMode === "none" ? [] : normalizeCheckpoints(checkpointsInput);

  // Prefer the slug the client signed into the kind:30100 event so the
  // persisted row and the published Nostr event stay in lockstep. Fall back
  // to server-side slugify for legacy callers (tests, manual API use) that
  // don't pre-sign anything.
  let slug: string;
  if (slugInput !== undefined && slugInput !== null) {
    if (typeof slugInput !== "string" || !SLUG.test(slugInput)) {
      throw new BadRequestError(
        "slug must be 1-100 characters of lowercase letters, digits, or hyphens"
      );
    }
    slug = slugInput;
  } else {
    slug = slugify(title);
  }

  let resolvedNostrEventId: string | null = null;
  if (nostrEventIdInput !== undefined && nostrEventIdInput !== null) {
    if (typeof nostrEventIdInput !== "string" || !HEX_64.test(nostrEventIdInput)) {
      throw new BadRequestError(
        "nostr_event_id must be a 64-character hex event id"
      );
    }
    resolvedNostrEventId = nostrEventIdInput.toLowerCase();
  }

  const newChallengeId = crypto.randomUUID();

  const challengeValues = {
    id: newChallengeId,
    creator_id: session!.user_id,
    nostr_event_id: resolvedNostrEventId,
    slug,
    title: title.trim(),
    description: description.trim(),
    type: type || "one_time",
    tags: resolvedTags,
    // When checkpoints are used, goal is the number of checkpoints and
    // unit is always "checkpoints" so participant.progress compares
    // directly against checkpoint count.
    goal: normalizedCheckpoints.length > 0 ? normalizedCheckpoints.length : goal || null,
    unit: normalizedCheckpoints.length > 0 ? "checkpoints" : unit || null,
    verification_methods: resolvedMethods,
    nostr_action_target_event_id: resolvedTargetEventId,
    nostr_hashtag: resolvedHashtag,
    checkpoint_mode: resolvedMode,
    prize_amount_sats: prize_amount_sats || 0,
    prize_distribution: prize_distribution || "none",
    zap_goal_event_id: resolvedZapGoalEventId,
    badge_name: badge_name || null,
    badge_image_url: resolvedBadgeImageUrl,
    starts_at: starts_at ? new Date(starts_at) : null,
    ends_at: ends_at ? new Date(ends_at) : null,
  };

  if (normalizedCheckpoints.length === 0) {
    const [challenge] = await db.insert(challenges).values(challengeValues).returning();
    return new CreatedResponse(challenge);
  }

  // Atomic insert of the challenge and its checkpoints. neon-http's
  // drizzle driver throws on db.transaction() but supports db.batch(),
  // which Neon executes as a single implicit HTTP transaction.
  const [challengeRows] = await db.batch([
    db.insert(challenges).values(challengeValues).returning(),
    db.insert(challenge_checkpoints).values(
      normalizedCheckpoints.map((cp, idx) => ({
        challenge_id: newChallengeId,
        order: idx,
        title: cp.title,
        description: cp.description ?? null,
        verification_methods: cp.verification_methods,
        nostr_action_target_event_id: cp.nostr_action_target_event_id ?? null,
        nostr_hashtag: cp.nostr_hashtag ?? null,
      }))
    ),
  ]);

  return new CreatedResponse(challengeRows[0]);
});
