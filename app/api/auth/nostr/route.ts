import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { apiHandler } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
import { validateAuthEvent } from "@/lib/nostr/verify";
import { fetchNostrMetadataServer } from "@/lib/nostr/server-metadata";
import { createSession } from "@/lib/auth";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET: Issue a challenge for NIP-42 auth
export const GET = apiHandler(
  async () => {
    const challenge = randomBytes(32).toString("hex");

    const cookieStore = await cookies();
    cookieStore.set("nostr_challenge", challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 300, // 5 minutes
      path: "/",
    });

    return challenge;
  },
  { requireAuth: false, rateLimit: "strict" }
);

// POST: Verify signed event and authenticate
export const POST = apiHandler(
  async (req, { db }) => {
    const { signedEvent } = await req.json();
    if (!signedEvent) throw new BadRequestError("Missing signed event");

    // Get challenge from cookie
    const cookieStore = await cookies();
    const challenge = cookieStore.get("nostr_challenge")?.value;
    if (!challenge) throw new BadRequestError("Challenge expired or missing");

    // Validate the signed event
    const isValid = await validateAuthEvent(signedEvent, challenge);
    if (!isValid) throw new BadRequestError("Invalid signature or challenge");

    // Clear challenge cookie
    cookieStore.delete("nostr_challenge");

    const pubkey = signedEvent.pubkey;

    // Find or create user
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.nostr_pubkey, pubkey))
      .limit(1);

    let user = existingUsers[0];

    if (!user) {
      const shortPubkey = pubkey.slice(0, 8);
      const [newUser] = await db
        .insert(users)
        .values({
          nostr_pubkey: pubkey,
          username: `nostr_${shortPubkey}`,
          display_name: `Nostr ${shortPubkey}`,
          locale: "es",
        })
        .returning();
      user = newUser;

      // Sync metadata from relays (best-effort, non-blocking)
      fetchNostrMetadataServer(pubkey)
        .then(async (metadata) => {
          if (metadata) {
            await db
              .update(users)
              .set({
                display_name: metadata.display_name || metadata.name || user.display_name,
                avatar_url: metadata.picture || null,
                about: metadata.about || null,
                lightning_address: metadata.lud16 || null,
                nostr_metadata: metadata,
                nostr_metadata_updated_at: new Date(),
                updated_at: new Date(),
              })
              .where(eq(users.id, user.id));
          }
        })
        .catch(() => {});
    }

    // Create session
    const token = await createSession({
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      locale: (user.locale as "es" | "en") || "es",
      nostr_pubkey: pubkey,
    });

    cookieStore.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return {
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
      nostr_pubkey: pubkey,
    };
  },
  { requireAuth: false, rateLimit: "strict" }
);
