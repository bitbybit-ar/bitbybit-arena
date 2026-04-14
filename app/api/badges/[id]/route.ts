import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { NotFoundError, ForbiddenError } from "@/lib/api/errors";
import { badges } from "@/lib/db/schema";

// PATCH /api/badges/[id] — the badge recipient marks it as "accepted on
// my Nostr profile". Called by the client after it publishes a kind:30008
// Profile Badges event that includes this badge's (a, e) pair. Only the
// recipient can mark their own badge as accepted.
export const PATCH = apiHandler(async (_req: NextRequest, { session, db, params }) => {
  const [badge] = await db
    .select()
    .from(badges)
    .where(eq(badges.id, params.id))
    .limit(1);

  if (!badge) throw new NotFoundError("Badge");
  if (badge.user_id !== session!.user_id) {
    throw new ForbiddenError("Only the badge recipient can mark it as accepted");
  }

  const [updated] = await db
    .update(badges)
    .set({ accepted_at: new Date() })
    .where(eq(badges.id, params.id))
    .returning();

  return updated;
});
