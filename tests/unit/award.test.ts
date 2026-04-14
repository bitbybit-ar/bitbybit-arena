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

const { POST, PATCH } = await import("@/app/api/challenges/[id]/award/route");
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

describe("PATCH /api/challenges/[id]/award", () => {
  beforeEach(() => {
    setSession(createMockSession({ user_id: "user-creator" }));
    setDbRows([]);
    setMutationResult([]);
  });

  it("requires authentication", async () => {
    setSession(null);
    const res = await PATCH(
      buildRequest("PATCH", "/api/challenges/challenge-1/award", {
        user_id: "user-1",
        nostr_event_id: "a".repeat(64),
      }),
      routeCtx
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-creator", async () => {
    setSession(createMockSession({ user_id: "non-creator" }));
    setDbRows([makeChallenge({ id: "challenge-1", creator_id: "user-creator" })]);
    const res = await PATCH(
      buildRequest("PATCH", "/api/challenges/challenge-1/award", {
        user_id: "user-1",
        nostr_event_id: "a".repeat(64),
      }),
      routeCtx
    );
    expect(res.status).toBe(403);
  });

  it("rejects missing user_id", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await PATCH(
      buildRequest("PATCH", "/api/challenges/challenge-1/award", {
        nostr_event_id: "a".repeat(64),
      }),
      routeCtx
    );
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain("user_id");
  });

  it("rejects nostr_event_id that isn't 64-hex", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await PATCH(
      buildRequest("PATCH", "/api/challenges/challenge-1/award", {
        user_id: "user-1",
        nostr_event_id: "too-short",
      }),
      routeCtx
    );
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain("nostr_event_id");
  });
});
