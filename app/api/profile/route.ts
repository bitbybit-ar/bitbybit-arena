import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
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
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.display_name !== undefined) {
    if (typeof body.display_name !== "string" || body.display_name.trim().length < 1) {
      throw new BadRequestError("Display name is required");
    }
    updates.display_name = body.display_name.trim();
  }
  if (body.username !== undefined) {
    if (typeof body.username !== "string" || body.username.trim().length < 3) {
      throw new BadRequestError("Username must be at least 3 characters");
    }
    updates.username = body.username.trim();
  }
  if (body.about !== undefined) updates.about = body.about;
  if (body.lightning_address !== undefined) updates.lightning_address = body.lightning_address;
  if (body.locale !== undefined) updates.locale = body.locale;

  if (Object.keys(updates).length === 0) {
    throw new BadRequestError("No fields to update");
  }

  updates.updated_at = new Date();

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, session!.user_id))
    .returning();

  return updated;
});
