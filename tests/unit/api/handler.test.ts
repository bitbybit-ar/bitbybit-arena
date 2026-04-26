/**
 * Unit tests for `apiHandler` — the wrapper every API route uses.
 *
 * Covers the cross-cutting concerns the wrapper owns:
 *   - rate-limiting (per IP + path) and the 429 response shape
 *   - auth gate (`requireAuth: true` returns 401 when no session)
 *   - success envelope (default 200, `CreatedResponse` → 201)
 *   - ApiError → status code + code mapping
 *   - unknown errors → 500 + 'internal'
 *   - x-forwarded-for IP extraction (rightmost-trusted)
 *   - private cache headers on every response
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  current: null as Record<string, unknown> | null,
};

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(() => Promise.resolve(mockSession.current)),
  AuthSession: {},
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));

const { apiHandler, CreatedResponse } = await import("@/lib/api/handler");
const {
  ApiError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} = await import("@/lib/api/errors");

function buildReq(path: string, ip?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (ip) headers["x-forwarded-for"] = ip;
  return new NextRequest(`http://localhost${path}`, { method: "GET", headers });
}

let pathCounter = 0;
/** Each test gets a unique path so the in-memory rate-limit map doesn't leak. */
function uniquePath(): string {
  return `/api/test-${++pathCounter}-${Date.now()}-${Math.random()}`;
}

beforeEach(() => {
  mockSession.current = { user_id: "u1", nostr_pubkey: "p1" };
});

describe("apiHandler — success envelope", () => {
  it("wraps the handler return in { success: true, data }", async () => {
    const route = apiHandler(async () => ({ hello: "world" }), {
      requireAuth: false,
    });
    const res = await route(buildReq(uniquePath(), "1.1.1.1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { hello: "world" } });
  });

  it("returns 201 when the handler returns a CreatedResponse", async () => {
    const route = apiHandler(
      async () => new CreatedResponse({ id: "x" }),
      { requireAuth: false }
    );
    const res = await route(buildReq(uniquePath(), "1.1.1.2"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual({ id: "x" });
  });

  it("sets Cache-Control: private, no-store on success", async () => {
    const route = apiHandler(async () => ({}), { requireAuth: false });
    const res = await route(buildReq(uniquePath(), "1.1.1.3"));
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("passes the resolved route params to the handler", async () => {
    const captured: Record<string, string>[] = [];
    const route = apiHandler(
      async (_req, { params }) => {
        captured.push(params);
        return null;
      },
      { requireAuth: false }
    );
    await route(buildReq(uniquePath(), "1.1.1.4"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(captured[0]).toEqual({ id: "abc" });
  });
});

describe("apiHandler — auth gate", () => {
  it("returns 401 when requireAuth is true and no session", async () => {
    mockSession.current = null;
    const route = apiHandler(async () => ({ ok: true }));
    const res = await route(buildReq(uniquePath(), "2.2.2.1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: "Unauthorized",
      code: "unauthorized",
    });
  });

  it("does NOT 401 when requireAuth is false", async () => {
    mockSession.current = null;
    const route = apiHandler(async () => ({ ok: true }), { requireAuth: false });
    const res = await route(buildReq(uniquePath(), "2.2.2.2"));
    expect(res.status).toBe(200);
  });
});

describe("apiHandler — error mapping", () => {
  it("maps BadRequestError to 400 with its code", async () => {
    const route = apiHandler(
      async () => {
        throw new BadRequestError("Bad foo");
      },
      { requireAuth: false }
    );
    const res = await route(buildReq(uniquePath(), "3.3.3.1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: "Bad foo",
      code: "bad_request",
    });
  });

  it("preserves the domain code on a custom ApiError subclass", async () => {
    const route = apiHandler(
      async () => {
        throw new BadRequestError("nope", "invalid_invoice");
      },
      { requireAuth: false }
    );
    const res = await route(buildReq(uniquePath(), "3.3.3.2"));
    const body = await res.json();
    expect(body.code).toBe("invalid_invoice");
  });

  it("maps NotFoundError to 404", async () => {
    const route = apiHandler(
      async () => {
        throw new NotFoundError("Challenge");
      },
      { requireAuth: false }
    );
    const res = await route(buildReq(uniquePath(), "3.3.3.3"));
    expect(res.status).toBe(404);
  });

  it("maps any other ApiError statusCode through as-is", async () => {
    const route = apiHandler(
      async () => {
        throw new ApiError(418, "tea", "internal");
      },
      { requireAuth: false }
    );
    const res = await route(buildReq(uniquePath(), "3.3.3.4"));
    expect(res.status).toBe(418);
  });

  it("returns 500 + 'internal' for an unknown thrown error", async () => {
    // Suppress the console.error('API error:', ...) noise — we expect it.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = apiHandler(
      async () => {
        throw new Error("boom");
      },
      { requireAuth: false }
    );
    const res = await route(buildReq(uniquePath(), "3.3.3.5"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: "Internal server error",
      code: "internal",
    });
    errSpy.mockRestore();
  });

  it("UnauthorizedError thrown from the handler is mapped via ApiError, not the auth gate", async () => {
    const route = apiHandler(
      async () => {
        throw new UnauthorizedError("Signature failed", "auth_invalid_signature");
      },
      { requireAuth: false }
    );
    const res = await route(buildReq(uniquePath(), "3.3.3.6"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("auth_invalid_signature");
  });
});

describe("apiHandler — rate limiting", () => {
  it("emits 429 with Retry-After once the standard tier limit (60/min) is exceeded", async () => {
    const path = uniquePath();
    const ip = "9.9.9.1";
    const route = apiHandler(async () => ({ ok: true }), {
      requireAuth: false,
    });

    // First 60 requests succeed, the 61st should 429.
    for (let i = 0; i < 60; i++) {
      const ok = await route(buildReq(path, ip));
      expect(ok.status).toBe(200);
    }
    const res = await route(buildReq(path, ip));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("rate_limit");
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(0);
  });

  it("rate-limits per (ip, path) — different IPs do not share buckets", async () => {
    const path = uniquePath();
    const route = apiHandler(async () => ({ ok: true }), {
      requireAuth: false,
    });
    // Burn through one IP's bucket first.
    for (let i = 0; i < 60; i++) {
      await route(buildReq(path, "10.10.10.1"));
    }
    const blocked = await route(buildReq(path, "10.10.10.1"));
    expect(blocked.status).toBe(429);
    // A different IP on the same path is not blocked.
    const fresh = await route(buildReq(path, "10.10.10.2"));
    expect(fresh.status).toBe(200);
  });

  it("uses the rightmost x-forwarded-for entry as the client IP", async () => {
    const path = uniquePath();
    const route = apiHandler(async () => ({ ok: true }), {
      requireAuth: false,
    });
    // The leftmost entry is attacker-controlled — if the handler used
    // it, two requests with the same trailing proxy would land in
    // *different* buckets and a single bad actor could evict legit
    // traffic. The implementation picks the last entry, so both calls
    // below land in the same bucket keyed on "real-edge".
    const burned = "1.2.3.4, attacker, real-edge";
    for (let i = 0; i < 60; i++) {
      await route(
        new NextRequest(`http://localhost${path}`, {
          method: "GET",
          headers: { "x-forwarded-for": burned },
        })
      );
    }
    const blocked = await route(
      new NextRequest(`http://localhost${path}`, {
        method: "GET",
        headers: { "x-forwarded-for": "different-attacker, attacker, real-edge" },
      })
    );
    expect(blocked.status).toBe(429);
  });

  it("strict tier (5 / 15min) blocks the 6th request", async () => {
    const path = uniquePath();
    const ip = "11.11.11.1";
    const route = apiHandler(async () => ({ ok: true }), {
      requireAuth: false,
      rateLimit: "strict",
    });
    for (let i = 0; i < 5; i++) {
      const ok = await route(buildReq(path, ip));
      expect(ok.status).toBe(200);
    }
    const blocked = await route(buildReq(path, ip));
    expect(blocked.status).toBe(429);
  });
});
