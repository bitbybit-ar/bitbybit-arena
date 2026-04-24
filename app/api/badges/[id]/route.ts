import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { findResourceOrOwn } from "@/lib/api/db-helpers";
import { badges } from "@/lib/db/schema";

// PATCH /api/badges/[id] — the badge recipient marks it as "accepted on
// my Nostr profile". Called by the client after it publishes a kind:30008
// Profile Badges event that includes this badge's (a, e) pair. Only the
// recipient can mark their own badge as accepted.
export const PATCH = apiHandler(async (_req: NextRequest, { session, db, params }) => {
  await findResourceOrOwn(db, badges, params.id, {
    resourceName: "Badge",
    ownerField: "user_id",
    session: session!,
    forbiddenMessage: "Only the badge recipient can mark it as accepted",
  });

  const [updated] = await db
    .update(badges)
    .set({ accepted_at: new Date() })
    .where(eq(badges.id, params.id))
    .returning();

  return updated;
});
