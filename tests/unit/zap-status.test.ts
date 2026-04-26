/**
 * Unit tests for POST /api/zap/status.
 *
 * In `.env.test` we don't set `NWC_CONNECTION_URL`, so the route
 * short-circuits to `{ paid: false }` before any NWC / parsing logic.
 * The full NWC settlement path is exercised end-to-end in production
 * smoke tests; here we just want to lock down the no-op fallback so
 * the zap modal degrades cleanly when a contributor runs without an
 * NWC URL configured.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => undefined,
      set: () => {},
      delete: () => {},
    }),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));

const { POST } = await import("@/app/api/zap/status/route");

function buildPostReq(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/zap/status?${Math.random()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/zap/status (no NWC configured)", () => {
  it("returns paid: false without consulting NWC", async () => {
    const res = await POST(buildPostReq({ invoice: "lnbc1abc" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.paid).toBe(false);
  });

  it("short-circuits before validating the body — no 400 on missing invoice", async () => {
    // The early-return runs before parseBody, so callers without NWC
    // configured don't get schema errors. Locks down the contract: a
    // dev environment without NWC always returns "not paid yet".
    const res = await POST(buildPostReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.paid).toBe(false);
  });
});
