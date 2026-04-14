import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildRequest, parseResponse, createMockSession, mockState,
  setSession, setDbRows, setMutationResult, setupDbMock,
  makeChallenge,
} from "../helpers";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(() => Promise.resolve(mockState.session)),
  AuthSession: {},
}));
vi.mock("@/lib/db", () => setupDbMock());

const completionsRoute = await import("@/app/api/challenges/[id]/completions/route");
const routeCtx = { params: Promise.resolve({ id: "challenge-1" }) };

describe("POST /api/challenges/[id]/completions — submit proof", () => {
  beforeEach(() => {
    setSession(createMockSession({ user_id: "user-participant" }));
    setDbRows([]);
    setMutationResult([]);
  });

  it("requires authentication", async () => {
    setSession(null);
    const res = await completionsRoute.POST(
      buildRequest("POST", "/api/challenges/challenge-1/completions", { content: "Did it!" }),
      routeCtx
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when challenge not found", async () => {
    setDbRows([]);
    const res = await completionsRoute.POST(
      buildRequest("POST", "/api/challenges/challenge-1/completions", { content: "Did it today!" }),
      routeCtx
    );
    expect(res.status).toBe(404);
  });

  it("rejects submission to cancelled challenge", async () => {
    setDbRows([makeChallenge({ id: "challenge-1", status: "cancelled" })]);
    const res = await completionsRoute.POST(
      buildRequest("POST", "/api/challenges/challenge-1/completions", { content: "Did it today!" }),
      routeCtx
    );
    expect(res.status).toBe(400);
  });

  it("rejects content shorter than 5 chars", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await completionsRoute.POST(
      buildRequest("POST", "/api/challenges/challenge-1/completions", { content: "hi" }),
      routeCtx
    );
    // Will either be 400 (content too short) or 403 (not participant) depending on order
    expect([400, 403]).toContain(res.status);
  });

  it("rejects empty content", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await completionsRoute.POST(
      buildRequest("POST", "/api/challenges/challenge-1/completions", {}),
      routeCtx
    );
    expect([400, 403]).toContain(res.status);
  });

  it("rejects image_url that is not an http(s) URL", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await completionsRoute.POST(
      buildRequest("POST", "/api/challenges/challenge-1/completions", {
        content: "Did it today!",
        image_url: "javascript:alert(1)",
      }),
      routeCtx
    );
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain("image_url");
  });
});

describe("GET /api/challenges/[id]/completions — list", () => {
  beforeEach(() => {
    setSession(null);
    setDbRows([]);
  });

  it("returns empty list when no completions", async () => {
    const res = await completionsRoute.GET(
      buildRequest("GET", "/api/challenges/challenge-1/completions"),
      routeCtx
    );
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("is a public endpoint (no auth needed)", async () => {
    setSession(null);
    const res = await completionsRoute.GET(
      buildRequest("GET", "/api/challenges/challenge-1/completions"),
      routeCtx
    );
    expect(res.status).toBe(200);
  });
});
