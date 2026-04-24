import { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { computeZapGoalProgressBatch } from "@/lib/nostr/zap-goal-progress";

// Caps the batch at roughly two full Explore pages (PAGE_LIMIT = 20)
// to keep one malicious call from tying up 500 relay subscriptions in
// parallel. Tune alongside the Explore page-size if that ever grows.
const MAX_BATCH_SIZE = 40;

const BatchBodySchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, "ids must be a non-empty array")
    .max(MAX_BATCH_SIZE, `ids may contain at most ${MAX_BATCH_SIZE} entries`),
});

/**
 * POST /api/challenges/zap-goal-progress
 *
 * Batch variant of `/api/challenges/[id]/zap-goal-progress`. Takes a
 * list of challenge ids, returns a map keyed by the same ids so
 * callers can index into it without re-walking the array:
 *
 *   { [challengeId: string]: ZapGoalProgressData | null }
 *
 * `null` is returned for ids that don't resolve to a challenge row —
 * matches the single-id endpoint's 404 for the same input. Rows that
 * exist but have no `zap_goal_event_id` get the same zero-filled
 * snapshot shape the single-id endpoint produces so the UI branch
 * that renders "0 / X sats" stays callable uniformly.
 *
 * Same auth posture (public) and per-id response shape as the
 * single-id route. Payload-bounded via `MAX_BATCH_SIZE` so a
 * malicious caller can't DoS via a giant request.
 */
export const POST = apiHandler(
  async (req: NextRequest, { db }) => {
    const { ids } = await parseBody(req, BatchBodySchema);
    return computeZapGoalProgressBatch(db, ids);
  },
  { requireAuth: false, rateLimit: "standard" }
);
