import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { apiHandler } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { UpdateProfileBodySchema } from "@/lib/schemas/profile";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { users } from "@/lib/db/schema";

// GET /api/profile — get current user profile
export const GET = apiHandler(async (_req: NextRequest, { session, db }) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session!.user_id))
    .limit(1);

  return user;
});

// PUT /api/profile — update profile
export const PUT = apiHandler(async (req: NextRequest, { session, db }) => {
  const body = await parseBody(req, UpdateProfileBodySchema);

  // `notification_prefs` arrives as a partial patch — we don't want the
  // client to have to send the full object every time they flip one
  // toggle, otherwise concurrent tabs race and stomp each other. Merge
  // with whatever's currently on the row.
  let mergedPrefs: Record<string, boolean> | undefined;
  if (body.notification_prefs) {
    const [current] = await db
      .select({ prefs: users.notification_prefs })
      .from(users)
      .where(eq(users.id, session!.user_id))
      .limit(1);
    mergedPrefs = { ...(current?.prefs ?? {}), ...body.notification_prefs };
  }

  const { notification_prefs: _ignored, ...rest } = body;

  const [updated] = await db
    .update(users)
    .set({
      ...rest,
      ...(mergedPrefs ? { notification_prefs: mergedPrefs } : {}),
      updated_at: new Date(),
    })
    .where(eq(users.id, session!.user_id))
    .returning();

  return updated;
});

// DELETE /api/profile — soft delete: scrub PII, keep row so FKs in
// challenges/participants/completions/badges stay valid. Nostr identity
// and relay events are untouched (we don't control those).
export const DELETE = apiHandler(async (_req: NextRequest, { session, db }) => {
  const shortId = session!.user_id.slice(0, 8);

  await db
    .update(users)
    .set({
      username: `deleted_${shortId}`,
      display_name: "[deleted]",
      avatar_url: null,
      about: null,
      lightning_address: null,
      nostr_metadata: null,
      nostr_metadata_updated_at: null,
      deleted_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(users.id, session!.user_id));

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  return { deleted: true };
});
