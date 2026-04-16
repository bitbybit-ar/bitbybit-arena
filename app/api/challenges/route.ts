import { NextRequest } from "next/server";
import { eq, and, ilike, inArray, or, sql, desc, asc } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { challenges, challenge_checkpoints, users } from "@/lib/db/schema";
import { slugify } from "@/lib/utils";
import {
  CreateChallengeBodySchema,
  ListChallengesQuerySchema,
} from "@/lib/schemas/challenges";

// GET /api/challenges — list with search, filters, sort, pagination
export const GET = apiHandler(
  async (req: NextRequest, { db }) => {
    const q = parseQuery(req, ListChallengesQuerySchema);
    const useFollowBoost = q.follow_pubkeys.length > 0;

    // Pre-built `(?,?,…)` value list reused below. We can't pass the JS
    // array straight into a `sql\`\`` literal — Drizzle serialises it
    // as a comma-joined string and Postgres rejects it with
    // `malformed array literal`. `sql.join` expands each element as
    // its own bound parameter, which is also injection-safe.
    const followPubkeysSql = useFollowBoost
      ? sql.join(
          q.follow_pubkeys.map((pk) => sql`${pk}`),
          sql`, `
        )
      : sql`NULL`;

    // True when the row's creator OR any active participant matches
    // the logged-in user's follow list. Used for both the "boost to
    // top" sort and the only_following hard filter, so the two stay
    // in lockstep.
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

    if (q.status) conditions.push(eq(challenges.status, q.status));
    if (q.types.length === 1) {
      conditions.push(eq(challenges.type, q.types[0]));
    } else if (q.types.length > 1) {
      conditions.push(inArray(challenges.type, q.types));
    }
    if (q.tag) conditions.push(sql`${q.tag} = ANY(${challenges.tags})`);
    if (q.tagsList.length > 0) {
      const tagChecks = q.tagsList.map(
        (t) => sql`${t} = ANY(${challenges.tags})`
      );
      const orClause = or(...tagChecks);
      if (orClause) conditions.push(orClause);
    }
    if (q.verification) {
      // Match challenges whose methods array contains this method
      conditions.push(sql`${q.verification} = ANY(${challenges.verification_methods})`);
    }
    if (q.search) {
      conditions.push(
        or(
          ilike(challenges.title, `%${q.search}%`),
          ilike(challenges.description, `%${q.search}%`)
        )
      );
    }
    if (useFollowBoost && q.only_following) {
      conditions.push(isFollowedSql);
    }
    // Cursor pagination on created_at only applies when follow boost is
    // off — the boost makes ordering tiered (followed first), so we
    // switch to offset-based pagination there to keep things simple.
    if (!useFollowBoost && q.cursor) {
      conditions.push(sql`${challenges.created_at} < ${q.cursor}`);
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
    switch (q.sort) {
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
    if (useFollowBoost && !q.only_following) {
      const orderByArr = Array.isArray(orderBy) ? orderBy : [orderBy];
      orderBy = [desc(isFollowedSql), ...orderByArr];
    }

    // When follow boost is active we can't use a created_at cursor
    // (the followed/not-followed boundary breaks monotonicity), so we
    // interpret `cursor` as an integer offset instead. Capped to keep
    // OFFSET scans bounded — past 10k rows the user should narrow with
    // search/filters anyway.
    const offset = useFollowBoost
      ? Math.min(10_000, Math.max(0, Number.parseInt(q.cursor ?? "0", 10) || 0))
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
      .limit(q.limit + 1);

    const rows = useFollowBoost
      ? await baseQuery.offset(offset)
      : await baseQuery;

    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit).map((row) => ({
      ...row.challenge,
      participant_count: row.participant_count,
      creator: row.creator,
    }));

    const nextCursor = hasMore
      ? useFollowBoost
        ? String(offset + q.limit)
        : items[items.length - 1].created_at?.toISOString()
      : null;

    return { items, nextCursor };
  },
  { requireAuth: false }
);

// POST /api/challenges — create a new challenge
export const POST = apiHandler(async (req: NextRequest, { session, db }) => {
  const body = await parseBody(req, CreateChallengeBodySchema);

  // Prefer the slug the client signed into the kind:30100 event so the
  // persisted row and the published Nostr event stay in lockstep. Fall
  // back to server-side slugify for legacy callers (tests, manual API
  // use) that don't pre-sign anything.
  const slug = body.slug ?? slugify(body.title);

  // When checkpoints are used, goal is the number of checkpoints and
  // unit is always "checkpoints" so participant.progress compares
  // directly against checkpoint count.
  const usingCheckpoints =
    body.checkpoint_mode !== "none" &&
    !!body.checkpoints &&
    body.checkpoints.length > 0;

  const newChallengeId = crypto.randomUUID();

  const challengeValues = {
    id: newChallengeId,
    creator_id: session!.user_id,
    nostr_event_id: body.nostr_event_id ?? null,
    slug,
    title: body.title,
    description: body.description,
    type: body.type ?? "one_time",
    tags: body.tags ?? [],
    goal: usingCheckpoints
      ? body.checkpoints!.length
      : body.goal ?? null,
    unit: usingCheckpoints ? "checkpoints" : body.unit ?? null,
    verification_methods: body.verification_methods,
    nostr_action_target_event_id: body.nostr_action_target_event_id,
    nostr_hashtag: body.nostr_hashtag,
    checkpoint_mode: body.checkpoint_mode,
    prize_amount_sats: body.prize_amount_sats ?? 0,
    prize_distribution: body.prize_distribution ?? "none",
    zap_goal_event_id: body.zap_goal_event_id ?? null,
    badge_name: body.badge_name ?? null,
    badge_image_url: body.badge_image_url ?? null,
    starts_at: body.starts_at ? new Date(body.starts_at) : null,
    ends_at: body.ends_at ? new Date(body.ends_at) : null,
  };

  if (!usingCheckpoints) {
    const [challenge] = await db
      .insert(challenges)
      .values(challengeValues)
      .returning();
    return new CreatedResponse(challenge);
  }

  // Atomic insert of the challenge and its checkpoints. neon-http's
  // drizzle driver throws on db.transaction() but supports db.batch(),
  // which Neon executes as a single implicit HTTP transaction.
  const [challengeRows] = await db.batch([
    db.insert(challenges).values(challengeValues).returning(),
    db.insert(challenge_checkpoints).values(
      body.checkpoints!.map((cp, idx) => ({
        challenge_id: newChallengeId,
        order: idx,
        title: cp.title,
        description: cp.description,
        verification_methods: cp.verification_methods,
        nostr_action_target_event_id: cp.nostr_action_target_event_id,
        nostr_hashtag: cp.nostr_hashtag,
      }))
    ),
  ]);

  return new CreatedResponse(challengeRows[0]);
});
