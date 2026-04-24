import { eq, inArray } from "drizzle-orm";
import { challenges } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { fetchZapReceipts, type ParsedZapReceipt } from "./fetch-zap-receipts";

export interface ZapGoalProgressZapper {
  pubkey: string;
  amount_sats: number;
  message: string;
  received_at: number;
}

export interface ZapGoalProgressData {
  challenge_id: string;
  goal_event_id: string | null;
  goal_sats: number;
  raised_sats: number;
  zapper_count: number;
  /** Up to the N most recent unique zappers, newest first. */
  recent_zappers: ZapGoalProgressZapper[];
}

interface CacheEntry {
  progress: ZapGoalProgressData;
  expiresAt: number;
}

// Per-serverless-instance cache. Same tradeoff as rate-limit: under
// load multiple Lambdas each keep their own copy, so a zap can appear
// in one worker 45s before another. Acceptable for a visual progress
// bar. Swap for a shared KV cache if this becomes load-bearing.
const CACHE_TTL_MS = 45_000;
const RECENT_ZAPPERS = 8;
const cache = new Map<string, CacheEntry>();

interface ChallengeRow {
  id: string;
  zap_goal_event_id: string | null;
  prize_amount_sats: number | null;
}

function buildProgress(
  challenge: ChallengeRow,
  receipts: ParsedZapReceipt[]
): ZapGoalProgressData {
  const goalSats = challenge.prize_amount_sats ?? 0;
  const raisedSats = receipts.reduce((sum, r) => sum + r.amount_sats, 0);
  const uniqueZappers = new Set(receipts.map((r) => r.zapper_pubkey));
  const recentZappers: ZapGoalProgressZapper[] = receipts
    .slice(0, RECENT_ZAPPERS)
    .map((r) => ({
      pubkey: r.zapper_pubkey,
      amount_sats: r.amount_sats,
      message: r.message,
      received_at: r.received_at,
    }));

  return {
    challenge_id: challenge.id,
    goal_event_id: challenge.zap_goal_event_id,
    goal_sats: goalSats,
    raised_sats: raisedSats,
    zapper_count: uniqueZappers.size,
    recent_zappers: recentZappers,
  };
}

function emptyProgress(challenge: ChallengeRow): ZapGoalProgressData {
  return {
    challenge_id: challenge.id,
    goal_event_id: challenge.zap_goal_event_id,
    goal_sats: challenge.prize_amount_sats ?? 0,
    raised_sats: 0,
    zapper_count: 0,
    recent_zappers: [],
  };
}

/**
 * Load cached progress if fresh; otherwise fetch relays for the given
 * challenge row, build a snapshot, cache it, and return it.
 *
 * Relay failure does not poison the cache — the next call retries
 * rather than sitting on a zero for the full TTL.
 */
async function hydrateFromRelays(
  challenge: ChallengeRow,
  now: number
): Promise<ZapGoalProgressData> {
  if (!challenge.zap_goal_event_id) {
    // No goal on-relay yet → return empty-but-valid shape so the UI
    // can render "0 / X sats" without a conditional branch per caller.
    const progress = emptyProgress(challenge);
    cache.set(challenge.id, { progress, expiresAt: now + CACHE_TTL_MS });
    return progress;
  }

  let receipts: ParsedZapReceipt[] = [];
  try {
    receipts = await fetchZapReceipts(challenge.zap_goal_event_id);
  } catch {
    // Relay outage — serve an empty progress snapshot. Don't cache
    // failure: the next request should retry instead of sitting on
    // a zero for 45s.
    return emptyProgress(challenge);
  }

  const progress = buildProgress(challenge, receipts);
  cache.set(challenge.id, { progress, expiresAt: now + CACHE_TTL_MS });
  return progress;
}

/**
 * Compute zap-goal progress for a single challenge by id. Returns
 * `null` when the challenge does not exist (callers map this to 404).
 */
export async function computeZapGoalProgress(
  db: Db,
  challengeId: string
): Promise<ZapGoalProgressData | null> {
  const now = Date.now();
  const cached = cache.get(challengeId);
  if (cached && now < cached.expiresAt) {
    return cached.progress;
  }

  const [challenge] = await db
    .select({
      id: challenges.id,
      zap_goal_event_id: challenges.zap_goal_event_id,
      prize_amount_sats: challenges.prize_amount_sats,
    })
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) return null;

  return hydrateFromRelays(challenge, now);
}

/**
 * Compute zap-goal progress for a list of challenge ids in one DB
 * round-trip + N parallel relay fetches (dedup'd by the per-instance
 * cache). Response is a map keyed by the *input* id. Ids the caller
 * supplied that don't resolve to a challenge row map to `null` — the
 * same shape the single-id endpoint would have produced as a 404.
 *
 * Missing `zap_goal_event_id` still produces a valid zero-filled
 * snapshot (not `null`), matching `computeZapGoalProgress` above, so
 * clients can render "0 / X sats" uniformly.
 */
export async function computeZapGoalProgressBatch(
  db: Db,
  challengeIds: string[]
): Promise<Record<string, ZapGoalProgressData | null>> {
  const result: Record<string, ZapGoalProgressData | null> = {};
  if (challengeIds.length === 0) return result;

  // Dedupe so a caller that accidentally repeats an id doesn't double
  // up on DB/relay work.
  const uniqueIds = Array.from(new Set(challengeIds));

  const now = Date.now();
  const misses: string[] = [];
  for (const id of uniqueIds) {
    const cached = cache.get(id);
    if (cached && now < cached.expiresAt) {
      result[id] = cached.progress;
    } else {
      misses.push(id);
    }
  }

  if (misses.length === 0) {
    // Fill any input id that wasn't covered yet (shouldn't happen here
    // since the cache-hit branch above covers them, but keep the shape
    // explicit for callers iterating over their original id list).
    for (const id of challengeIds) {
      if (!(id in result)) result[id] = null;
    }
    return result;
  }

  const rows = await db
    .select({
      id: challenges.id,
      zap_goal_event_id: challenges.zap_goal_event_id,
      prize_amount_sats: challenges.prize_amount_sats,
    })
    .from(challenges)
    .where(inArray(challenges.id, misses));

  const rowById = new Map(rows.map((r) => [r.id, r]));

  // Fire all the cache-miss hydrations in parallel; each call
  // internally caches its own result, so subsequent ids in the same
  // batch that share the same challenge (after dedupe they don't, but
  // the TTL still protects overlapping batches) get the fast path.
  const hydrations = misses.map(async (id) => {
    const row = rowById.get(id);
    if (!row) {
      result[id] = null;
      return;
    }
    result[id] = await hydrateFromRelays(row, now);
  });

  await Promise.all(hydrations);

  for (const id of challengeIds) {
    if (!(id in result)) result[id] = null;
  }

  return result;
}
