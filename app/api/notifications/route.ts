import { NextRequest } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { NotFoundError } from "@/lib/api/errors";
import { notifications } from "@/lib/db/schema";

const ListQuerySchema = z.object({
  unread: z.enum(["true", "false"]).optional(),
});

const PatchBodySchema = z.object({
  id: z.string().uuid(),
});

// GET /api/notifications?unread=true — list (newest first, 50 max).
export const GET = apiHandler(async (req: NextRequest, { session, db }) => {
  const { unread } = parseQuery(req, ListQuerySchema);
  const unreadOnly = unread === "true";

  const conditions = [eq(notifications.user_id, session!.user_id)];
  if (unreadOnly) conditions.push(eq(notifications.read, false));

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.created_at))
    .limit(50);
});

// PATCH /api/notifications — mark one as read.
// Body: { id }
export const PATCH = apiHandler(async (req: NextRequest, { session, db }) => {
  const { id } = await parseBody(req, PatchBodySchema);

  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(eq(notifications.id, id), eq(notifications.user_id, session!.user_id))
    )
    .returning();

  if (!updated) throw new NotFoundError("Notification");
  return updated;
});

// POST /api/notifications/read-all — mark everything read in one shot.
// Kept on the collection route so we don't need a sub-route for one verb.
export const POST = apiHandler(async (_req: NextRequest, { session, db }) => {
  await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.user_id, session!.user_id),
        eq(notifications.read, false)
      )
    );
  return { ok: true };
});
