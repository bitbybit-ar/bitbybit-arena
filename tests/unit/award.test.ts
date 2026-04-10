import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildRequest, createMockSession, mockState,
  setSession, setDbRows, setMutationResult, setupDbMock,
  makeChallenge,
} from "../helpers";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(() => Promise.resolve(mockState.session)),
  AuthSession: {},
}));
vi.mock("@/lib/db", () => setupDbMock());

const { POST } = await import("@/app/api/challenges/[id]/award/route");
const routeCtx = { params: Promise.resolve({ id: "challenge-1" }) };

describe("POST /api/challenges/[id]/award", () => {
  beforeEach(() => {
    setSession(createMockSession({ user_id: "user-creator" }));
    setDbRows([]);
    setMutationResult([]);
  });

  it("requires authentication", async () => {
    setSession(null);
    const res = await POST(
      buildRequest("POST", "/api/challenges/challenge-1/award", { user_ids: ["user-1"] }),
      routeCtx
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when challenge not found", async () => {
    setDbRows([]);
    const res = await POST(
      buildRequest("POST", "/api/challenges/challenge-1/award", { user_ids: ["user-1"] }),
      routeCtx
    );
    expect(res.status).toBe(404);
  });

  it("rejects non-creator", async () => {
    setSession(createMockSession({ user_id: "non-creator" }));
    setDbRows([makeChallenge({ id: "challenge-1", creator_id: "user-creator" })]);

    const res = await POST(
      buildRequest("POST", "/api/challenges/challenge-1/award", { user_ids: ["user-1"] }),
      routeCtx
    );
    expect(res.status).toBe(403);
  });

  it("rejects empty user_ids array", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await POST(
      buildRequest("POST", "/api/challenges/challenge-1/award", { user_ids: [] }),
      routeCtx
    );
    expect(res.status).toBe(400);
  });

  it("rejects non-array user_ids", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await POST(
      buildRequest("POST", "/api/challenges/challenge-1/award", { user_ids: "not-an-array" }),
      routeCtx
    );
    expect(res.status).toBe(400);
  });

  it("rejects when users are not participants", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    // Second select (participants) returns empty = no valid participants
    const res = await POST(
      buildRequest("POST", "/api/challenges/challenge-1/award", { user_ids: ["user-nobody"] }),
      routeCtx
    );
    expect(res.status).toBe(400);
  });
});
