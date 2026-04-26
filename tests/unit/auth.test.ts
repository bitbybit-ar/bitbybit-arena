/**
 * @vitest-environment node
 *
 * Unit tests for `lib/auth.ts` — JWT session creation and the
 * cookie-backed `getSession` reader.
 *
 * Runs under the node environment because jose's webapi build
 * (loaded under jsdom) requires a CryptoKey instead of a Uint8Array
 * secret, which is not how `lib/auth.ts` calls it. Same workaround
 * the integration tests use.
 *
 * Mocks `next/headers` so the cookie store is in-memory and
 * deterministic. The HS256 secret used for signing falls back to the
 * dev-only `"dev-secret-change-in-production"` because we don't set
 * AUTH_SECRET before importing the module under test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory cookie store wired into vi.mock("next/headers"). We import
// the module under test *after* registering the mock so its top-level
// `cookies()` calls resolve to our store.
const cookieStore = {
  _values: new Map<string, string>(),
  get: vi.fn((name: string) => {
    const v = cookieStore._values.get(name);
    return v ? { value: v } : undefined;
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

const { createSession, getSession, SESSION_COOKIE_NAME } = await import(
  "@/lib/auth"
);

beforeEach(() => {
  cookieStore._values.clear();
  cookieStore.get.mockClear();
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
});

const validPayload = {
  user_id: "user-123",
  username: "alice",
  display_name: "Alice",
  avatar_url: null as string | null,
  locale: "es" as const,
  nostr_pubkey: "a".repeat(64),
  signer_type: "extension" as const,
  profile_completed: true,
};

describe("createSession + getSession", () => {
  it("round-trips a valid session through the cookie", async () => {
    const token = await createSession(validPayload);
    cookieStore._values.set(SESSION_COOKIE_NAME, token);

    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session!.user_id).toBe("user-123");
    expect(session!.username).toBe("alice");
    expect(session!.locale).toBe("es");
    expect(session!.signer_type).toBe("extension");
    expect(session!.profile_completed).toBe(true);
  });

  it("returns null when the cookie is missing", async () => {
    expect(await getSession()).toBeNull();
  });

  it("returns null when the cookie value is not a valid JWT", async () => {
    cookieStore._values.set(SESSION_COOKIE_NAME, "not.a.jwt");
    expect(await getSession()).toBeNull();
  });

  it("returns null when the JWT is signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ ...validPayload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(wrongSecret);

    cookieStore._values.set(SESSION_COOKIE_NAME, token);
    expect(await getSession()).toBeNull();
  });

  it("returns null when the payload is missing user_id or nostr_pubkey", async () => {
    const token = await createSession({
      ...validPayload,
      user_id: "",
    });
    cookieStore._values.set(SESSION_COOKIE_NAME, token);
    expect(await getSession()).toBeNull();
  });

  it("normalises an unknown signer_type to null (forward-compat shield)", async () => {
    // Old / forged tokens may carry an unrecognised signer_type — treat
    // it as "no preference" rather than trusting the value.
    const token = await createSession({
      ...validPayload,
      signer_type: "passkey" as unknown as "extension",
    });
    cookieStore._values.set(SESSION_COOKIE_NAME, token);

    const session = await getSession();
    expect(session?.signer_type).toBeNull();
  });

  it("defaults profile_completed to true for legacy tokens with the field missing", async () => {
    // Old sessions issued before profile_completed existed should not
    // re-trigger onboarding after deploy.
    const token = await createSession({
      user_id: validPayload.user_id,
      username: validPayload.username,
      display_name: validPayload.display_name,
      avatar_url: validPayload.avatar_url,
      locale: validPayload.locale,
      nostr_pubkey: validPayload.nostr_pubkey,
    });
    cookieStore._values.set(SESSION_COOKIE_NAME, token);

    const session = await getSession();
    expect(session?.profile_completed).toBe(true);
  });

  it("respects profile_completed: false when explicitly set", async () => {
    const token = await createSession({
      ...validPayload,
      profile_completed: false,
    });
    cookieStore._values.set(SESSION_COOKIE_NAME, token);

    const session = await getSession();
    expect(session?.profile_completed).toBe(false);
  });

  it("normalises an unknown locale to 'es' (the default)", async () => {
    const token = await createSession({
      ...validPayload,
      locale: "fr" as unknown as "es",
    });
    cookieStore._values.set(SESSION_COOKIE_NAME, token);

    const session = await getSession();
    expect(session?.locale).toBe("es");
  });

  it("returns null for an expired JWT", async () => {
    // Use jose directly to mint a token that is already expired.
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("dev-secret-change-in-production");
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = await new SignJWT({ ...validPayload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(past - 100)
      .setExpirationTime(past)
      .sign(secret);

    cookieStore._values.set(SESSION_COOKIE_NAME, token);
    expect(await getSession()).toBeNull();
  });
});
