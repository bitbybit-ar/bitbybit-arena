import { NextRequest } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { computeZapGoalProgress } from "@/lib/nostr/zap-goal-progress";

// Re-export the response types from their canonical home so existing
// callers that do `import type { ZapGoalProgressData } from ".../[id]/route"`
// keep compiling. Actual definitions live in `lib/nostr/zap-goal-progress.ts`
// alongside the shared helpers the batch route also consumes.
export type {
  ZapGoalProgressData,
  ZapGoalProgressZapper,
} from "@/lib/nostr/zap-goal-progress";

export const GET = apiHandler(
  async (_req: NextRequest, { db, params }) => {
    const progress = await computeZapGoalProgress(db, params.id);
    if (!progress) throw new NotFoundError("Challenge");
    return progress;
  },
  { requireAuth: false, rateLimit: "standard" }
);
