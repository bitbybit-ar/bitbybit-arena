import { cookies } from "next/headers";
import { apiHandler } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
import { validateNip98AuthEvent } from "@/lib/nostr/verify";
import { fetchNostrMetadataServer } from "@/lib/nostr/server-metadata";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { SignerTypeSchema } from "@/lib/schemas/auth";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SignerType } from "@/lib/nostr/signers";

/**
 * NIP-98 (HTTP Auth) login.
 *
 * The request carries the signed event in the `Authorization` header,
 * base64-encoded per the spec:
 *
 *     Authorization: Nostr <base64(JSON.stringify(event))>
 *
 * No challenge cookie, no GET round-trip. Replay protection comes
 * from:
 *   - the `u` tag binding the event to this exact URL
 *   - the `method` tag binding it to POST
 *   - the ±60 s `created_at` window
 *   - server-side rate limiting per IP
 *
 * The signer method (extension / nsec / nip46) travels in a custom
 * `["arena_signer", ...]` tag so it's part of the signed envelope —
 * a man-in-the-middle can't forge a different signer_type onto a
 * captured event without invalidating the signature.
 */

const SIGNER_TAG = "arena_signer";

function parseAuthorizationHeader(header: string | null): unknown {
  if (!header) {
    throw new BadRequestError("Missing Authorization header");
  }
  const [scheme, encoded] = header.split(/\s+/, 2);
  if (scheme !== "Nostr" || !encoded) {
    throw new BadRequestError("Authorization header must use the Nostr scheme");
  }
  try {
    const json = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    throw new BadRequestError("Authorization header is not valid base64 JSON");
  }
}

function readSignerType(tags: ReadonlyArray<ReadonlyArray<string>>): SignerType | null {
  const raw = tags.find((t) => t[0] === SIGNER_TAG)?.[1];
  if (!raw) return null;
  const parsed = SignerTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const POST = apiHandler(
  async (req, { db }) => {
    const signedEvent = parseAuthorizationHeader(
      req.headers.get("authorization")
    );

    const validation = validateNip98AuthEvent(signedEvent, {
      url: req.nextUrl.toString(),
      method: req.method,
    });
    if (!validation.ok) {
      console.warn(
        `[auth/nostr] validation failed: ${validation.reason}`,
        { pubkey: (signedEvent as { pubkey?: unknown })?.pubkey }
      );
      throw new BadRequestError(
        `Invalid signature or auth event (${validation.reason})`
      );
    }
    const event = validation.event;
    const pubkey = event.pubkey;
    const signerType = readSignerType(event.tags);

    // Find or create user
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.nostr_pubkey, pubkey))
      .limit(1);

    let user = existingUsers[0];
    const isReactivation = !!(user && user.deleted_at);
    const isNewSignup = !user;

    // Reactivate soft-deleted account: signing in with the same Nostr key
    // restores access. We re-hydrate the row from relay metadata BEFORE
    // issuing the session so the JWT carries the user's real display
    // name instead of the `Nostr <pubkey-prefix>` placeholder, otherwise
    // the first post-reactivation render flashes the placeholder until
    // the next refresh.
    if (isReactivation) {
      const shortPubkey = pubkey.slice(0, 8);
      const [reactivated] = await db
        .update(users)
        .set({
          username: `nostr_${shortPubkey}`,
          display_name: `Nostr ${shortPubkey}`,
          deleted_at: null,
          updated_at: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
      user = reactivated;
    }

    if (isNewSignup) {
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
    }

    // Hydrate metadata from relays for fresh signups and reactivations.
    // We `await` (with a short timeout) so the JWT we mint a few lines
    // below carries the user's real display_name / avatar_url. Best
    // effort: if relays are slow or the user has no kind:0, the session
    // still issues with the placeholder — the user can re-sync from
    // settings later.
    if (isNewSignup || isReactivation) {
      user = await hydrateMetadata(db, user, pubkey);
    }

    // Create session
    const token = await createSession({
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      locale: (user.locale as "es" | "en") || "es",
      nostr_pubkey: pubkey,
      signer_type: signerType,
    });

    // `__Host-` prefix forces secure + path=/ + no Domain attribute,
    // which blocks subdomain cookie injection from any future
    // `*.bitbybit.com.ar` service. Browsers refuse to set the cookie
    // if any of those constraints are violated, so this is a hard
    // guarantee, not just convention.
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
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
  { requireAuth: false, rateLimit: "auth" }
);

const METADATA_HYDRATE_TIMEOUT_MS = 2_500;

type UserRow = typeof users.$inferSelect;

async function hydrateMetadata(
  db: import("@/lib/db").Db,
  user: UserRow,
  pubkey: string
): Promise<UserRow> {
  // Race the relay fetch against a hard timeout. We hold the
  // setTimeout handle and clear it in `.finally()` so a fast relay
  // response doesn't leave a dangling timer pinned in the serverless
  // event loop until it fires (a small per-login cost, but real).
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const metadata = await Promise.race([
      fetchNostrMetadataServer(pubkey).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }),
      new Promise<null>((resolve) => {
        timeoutHandle = setTimeout(
          () => resolve(null),
          METADATA_HYDRATE_TIMEOUT_MS
        );
      }),
    ]);
    if (!metadata) return user;

    const [updated] = await db
      .update(users)
      .set({
        display_name:
          metadata.display_name || metadata.name || user.display_name,
        avatar_url: metadata.picture || null,
        about: metadata.about || null,
        lightning_address: metadata.lud16 || null,
        nostr_metadata: metadata,
        nostr_metadata_updated_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    return updated ?? user;
  } catch {
    return user;
  }
}
