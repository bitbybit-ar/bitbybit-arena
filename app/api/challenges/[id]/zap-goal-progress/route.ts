import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { challenges } from "@/lib/db/schema";
import {
  fetchZapReceipts,
  type ParsedZapReceipt,
} from "@/lib/nostr/fetch-zap-receipts";

interface CacheEntry {
  progress: ZapGoalProgressData;
  expiresAt: number;
}

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

// Per-serverless-instance cache. Same tradeoff as rate-limit: under
// load multiple Lambdas each keep their own copy, so a zap can appear
// in one worker 45s before another. Acceptable for a visual progress
// bar. Swap for a shared KV cache if this becomes load-bearing.
const CACHE_TTL_MS = 45_000;
const RECENT_ZAPPERS = 8;
const cache = new Map<string, CacheEntry>();

export const GET = apiHandler(
  async (_req: NextRequest, { db, params }) => {
    const now = Date.now();
    const cached = cache.get(params.id);
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
      .where(eq(challenges.id, params.id))
      .limit(1);

    if (!challenge) throw new NotFoundError("Challenge");

    const goalSats = challenge.prize_amount_sats ?? 0;

    // No goal on-relay yet → return empty-but-valid shape so the UI
    // can render "0 / X sats" without a conditional branch per caller.
    if (!challenge.zap_goal_event_id) {
      const progress: ZapGoalProgressData = {
        challenge_id: challenge.id,
        goal_event_id: null,
        goal_sats: goalSats,
        raised_sats: 0,
        zapper_count: 0,
        recent_zappers: [],
      };
      cache.set(params.id, { progress, expiresAt: now + CACHE_TTL_MS });
      return progress;
    }

    let receipts: ParsedZapReceipt[] = [];
    try {
      receipts = await fetchZapReceipts(challenge.zap_goal_event_id);
    } catch {
      // Relay outage — serve an empty progress snapshot. Don't cache
      // failure: the next request should retry instead of sitting on
      // a zero for 45s.
      return {
        challenge_id: challenge.id,
        goal_event_id: challenge.zap_goal_event_id,
        goal_sats: goalSats,
        raised_sats: 0,
        zapper_count: 0,
        recent_zappers: [],
      } satisfies ZapGoalProgressData;
    }

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

    const progress: ZapGoalProgressData = {
      challenge_id: challenge.id,
      goal_event_id: challenge.zap_goal_event_id,
      goal_sats: goalSats,
      raised_sats: raisedSats,
      zapper_count: uniqueZappers.size,
      recent_zappers: recentZappers,
    };

    cache.set(params.id, { progress, expiresAt: now + CACHE_TTL_MS });
    return progress;
  },
  { requireAuth: false, rateLimit: "standard" }
);
