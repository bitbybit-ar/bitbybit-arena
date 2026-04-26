/**
 * @vitest-environment node
 *
 * Thin route-level coverage for the auth endpoints that don't have
 * dedicated integration tests:
 *   - POST /api/auth/signout — clears the session cookie
 *   - GET  /api/auth/session — echoes the current session, or 401
 *
 * Runs under the node environment because the routes import `lib/auth`
 * which uses jose's webapi build (jsdom-incompatible Uint8Array path).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));

const { POST: signoutPOST } = await import("@/app/api/auth/signout/route");
const { GET: sessionGET } = await import("@/app/api/auth/session/route");
const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/auth");

beforeEach(() => {
  cookieStore._values.clear();
  cookieStore.delete.mockClear();
});

function buildReq(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}-${Math.random()}`, {
    method: "GET",
    headers: { "x-forwarded-for": "127.0.0.1" },
  });
}

describe("POST /api/auth/signout", () => {
  it("deletes the session cookie and returns ok: true", async () => {
    cookieStore._values.set(SESSION_COOKIE_NAME, "fake-token");

    const res = await signoutPOST(
      new NextRequest(`http://localhost/api/auth/signout?${Math.random()}`, {
        method: "POST",
        headers: { "x-forwarded-for": "127.0.0.2" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { ok: true } });
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("succeeds even when there is no session (idempotent)", async () => {
    const res = await signoutPOST(
      new NextRequest(`http://localhost/api/auth/signout?${Math.random()}`, {
        method: "POST",
        headers: { "x-forwarded-for": "127.0.0.3" },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/session", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await sessionGET(buildReq("/api/auth/session/none"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthorized");
  });

  it("returns the parsed session payload when authenticated", async () => {
    const token = await createSession({
      user_id: "u1",
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
      locale: "es",
      nostr_pubkey: "a".repeat(64),
      signer_type: "extension",
      profile_completed: true,
    });
    cookieStore._values.set(SESSION_COOKIE_NAME, token);

    const res = await sessionGET(buildReq("/api/auth/session/ok"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user_id).toBe("u1");
    expect(body.data.username).toBe("alice");
    expect(body.data.signer_type).toBe("extension");
    expect(body.data.profile_completed).toBe(true);
  });
});
