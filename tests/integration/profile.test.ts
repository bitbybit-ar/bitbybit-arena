/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { cleanDb, testDb } from "./setup";
import { users } from "@/lib/db/schema";
import {
  setSession,
  makeSession,
  seedUser,
  buildRequest,
  parseResponse,
} from "./helpers";

vi.mock("@/lib/db", async () => {
  const { testDb } = await import("./setup");
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>(
    "@/lib/db/schema"
  );
  return { getDb: vi.fn(() => testDb), ...schema };
});

// Stub the relay metadata fetcher so sync tests never hit real relays.
const metadataMock = vi.fn();
vi.mock("@/lib/nostr/server-metadata", () => ({
  fetchNostrMetadataServer: (...args: unknown[]) => metadataMock(...args),
}));

// Shared cookie store mock — configurable per test (for reactivation flow
// we need cookies().get("nostr_challenge") to return a value).
const cookieStore = {
  _values: new Map<string, string>(),
  get: vi.fn((name: string) => {
    const value = cookieStore._values.get(name);
    return value ? { value } : undefined;
  }),
  set: vi.fn((name: string, value: string) => {
    cookieStore._values.set(name, value);
  }),
  delete: vi.fn((name: string) => {
    cookieStore._values.delete(name);
  }),
};
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

// Reactivation test needs the NIP-98 validator to succeed without
// crypto. The route handler downstream reads `event.pubkey` and
// `event.tags`, so the mock returns a minimal shape that satisfies
// both reads.
vi.mock("@/lib/nostr/verify", () => ({
  validateNip98AuthEvent: vi.fn((input: unknown) => ({
    ok: true,
    event: {
      pubkey: (input as { pubkey?: string })?.pubkey ?? "a".repeat(64),
      tags: [],
    },
  })),
}));

// Reactivation test uses a stubbed createSession.
vi.mock("@/lib/auth", async () => {
  const { sessionRef } = await import("./helpers");
  return {
    getSession: vi.fn(() => Promise.resolve(sessionRef.current)),
    createSession: vi.fn(() => Promise.resolve("stub-token")),
    AuthSession: {},
  };
});

const profileRoute = await import("@/app/api/profile/route");
const syncRoute = await import("@/app/api/profile/sync/route");
const authRoute = await import("@/app/api/auth/nostr/route");

describe("Integration: Profile API", () => {
  let user: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    metadataMock.mockReset();
    cookieStore._values.clear();
    cookieStore.get.mockClear();
    cookieStore.set.mockClear();
    cookieStore.delete.mockClear();
    user = await seedUser({
      display_name: "Alice",
      about: "hello",
      lightning_address: "alice@getalby.com",
    });
    setSession(makeSession(user.id, { nostr_pubkey: user.nostr_pubkey }));
  });

  describe("PUT /api/profile", () => {
    it("updates allowed fields", async () => {
      const res = await profileRoute.PUT(
        buildRequest("PUT", "/api/profile", {
          display_name: "Alice Updated",
          about: "new bio",
        })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.display_name).toBe("Alice Updated");
      expect(body.data.about).toBe("new bio");
    });

    it("rejects short username", async () => {
      const res = await profileRoute.PUT(
        buildRequest("PUT", "/api/profile", { username: "ab" })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(400);
      expect(body.error).toContain("at least 3");
    });

    it("rejects invalid locale", async () => {
      const res = await profileRoute.PUT(
        buildRequest("PUT", "/api/profile", { locale: "fr" })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(400);
      expect(body.error).toContain("locale");
    });

    it("accepts valid locale change", async () => {
      const res = await profileRoute.PUT(
        buildRequest("PUT", "/api/profile", { locale: "en" })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.locale).toBe("en");
    });

    it("accepts a valid https avatar_url and clears it on null", async () => {
      const res1 = await profileRoute.PUT(
        buildRequest("PUT", "/api/profile", {
          avatar_url: "https://example.com/me.png",
        })
      );
      const { status: s1, body: b1 } = await parseResponse(res1);
      expect(s1).toBe(200);
      expect(b1.data.avatar_url).toBe("https://example.com/me.png");

      const res2 = await profileRoute.PUT(
        buildRequest("PUT", "/api/profile", { avatar_url: null })
      );
      const { body: b2 } = await parseResponse(res2);
      expect(b2.data.avatar_url).toBeNull();
    });

    it("rejects avatar_url that is not an http(s) URL", async () => {
      const res = await profileRoute.PUT(
        buildRequest("PUT", "/api/profile", { avatar_url: "not-a-url" })
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.error).toContain("avatar_url");
    });
  });

  describe("DELETE /api/profile (soft delete)", () => {
    it("scrubs PII, sets deleted_at, keeps row, clears session cookie", async () => {
      const res = await profileRoute.DELETE(buildRequest("DELETE", "/api/profile"));
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.deleted).toBe(true);
      expect(cookieStore.delete).toHaveBeenCalledWith("session");

      // Row still exists — FKs from challenges/participants/etc stay valid.
      const [row] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      expect(row).toBeDefined();
      expect(row.display_name).toBe("[deleted]");
      expect(row.username).toMatch(/^deleted_/);
      expect(row.avatar_url).toBeNull();
      expect(row.about).toBeNull();
      expect(row.lightning_address).toBeNull();
      expect(row.nostr_metadata).toBeNull();
      expect(row.deleted_at).not.toBeNull();
      // Nostr pubkey is intentionally preserved so the user can reactivate.
      expect(row.nostr_pubkey).toBe(user.nostr_pubkey);
    });
  });

  describe("POST /api/profile/sync", () => {
    it("writes metadata fields from relays into the user row", async () => {
      metadataMock.mockResolvedValueOnce({
        display_name: "Alice From Relay",
        name: "alice_relay",
        picture: "https://example.com/avatar.png",
        about: "bio from relay",
        lud16: "alice@strike.me",
      });

      const res = await syncRoute.POST(
        buildRequest("POST", "/api/profile/sync")
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.display_name).toBe("Alice From Relay");
      expect(body.data.avatar_url).toBe("https://example.com/avatar.png");
      expect(body.data.about).toBe("bio from relay");
      expect(body.data.lightning_address).toBe("alice@strike.me");
      expect(body.data.nostr_metadata_updated_at).not.toBeNull();
      expect(metadataMock).toHaveBeenCalledWith(user.nostr_pubkey);
    });

    it("falls back to existing display_name when metadata has neither display_name nor name", async () => {
      metadataMock.mockResolvedValueOnce({
        picture: "https://example.com/avatar.png",
      });

      const res = await syncRoute.POST(
        buildRequest("POST", "/api/profile/sync")
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.display_name).toBe("Alice"); // preserved from seed
      expect(body.data.avatar_url).toBe("https://example.com/avatar.png");
      expect(body.data.about).toBeNull();
      expect(body.data.lightning_address).toBeNull();
    });

    it("returns 400 when no metadata found on relays", async () => {
      metadataMock.mockResolvedValueOnce(null);

      const res = await syncRoute.POST(
        buildRequest("POST", "/api/profile/sync")
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(400);
      expect(body.error).toContain("No metadata");
    });
  });

  describe("POST /api/auth/nostr — reactivation", () => {
    it("reactivates a soft-deleted user on re-login with the same pubkey", async () => {
      // 1. Soft-delete the seeded user.
      await profileRoute.DELETE(buildRequest("DELETE", "/api/profile"));

      const [deleted] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.display_name).toBe("[deleted]");

      // 2. Simulate re-auth: challenge cookie + signed event.
      cookieStore._values.set("nostr_challenge", "test-challenge");
      // Background resync fires fire-and-forget inside the handler; it
      // needs a resolved Promise even though the test doesn't assert on
      // the eventual fields.
      metadataMock.mockResolvedValue(null);
      // validateAuthEvent is mocked to always return true, so the event
      // payload just needs to carry the same pubkey.
      const signedEvent = { pubkey: user.nostr_pubkey };

      const res = await authRoute.POST(
        buildRequest("POST", "/api/auth/nostr", { signedEvent })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.user_id).toBe(user.id);

      // 3. Row is reactivated: deleted_at cleared, username reset,
      // display_name reset to the default — ready for metadata sync to
      // populate the real profile fields from relays.
      const [reactivated] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      expect(reactivated.deleted_at).toBeNull();
      expect(reactivated.username).toMatch(/^nostr_/);
      expect(reactivated.display_name).toMatch(/^Nostr /);
    });
  });
});
