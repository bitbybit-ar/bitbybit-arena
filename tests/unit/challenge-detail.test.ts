import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildRequest, parseResponse, createMockSession, mockState,
  setSession, setDbRows, setMutationResult, setupDbMock, makeChallenge, makeUser,
} from "../helpers";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(() => Promise.resolve(mockState.session)),
  AuthSession: {},
}));
vi.mock("@/lib/db", () => setupDbMock());

const { GET, PUT, DELETE } = await import("@/app/api/challenges/[id]/route");
const routeCtx = { params: Promise.resolve({ id: "challenge-1" }) };

describe("GET /api/challenges/[id]", () => {
  beforeEach(() => {
    setSession(null);
    setDbRows([]);
  });

  it("returns 404 when challenge not found", async () => {
    setDbRows([]);
    const res = await GET(buildRequest("GET", "/api/challenges/challenge-1"), routeCtx);
    expect(res.status).toBe(404);
  });

  it("returns challenge with counts", async () => {
    const creator = makeUser({ id: "user-creator" });
    setDbRows([{
      challenge: makeChallenge({ id: "challenge-1" }),
      creator: { id: creator.id, username: creator.username, display_name: creator.display_name, avatar_url: null, nostr_pubkey: creator.nostr_pubkey, lightning_address: null },
      participant_count: 3,
      completion_count: 1,
    }]);

    const res = await GET(buildRequest("GET", "/api/challenges/challenge-1"), routeCtx);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.participant_count).toBe(3);
    expect(body.data.completion_count).toBe(1);
  });
});

describe("PUT /api/challenges/[id]", () => {
  beforeEach(() => {
    setSession(createMockSession());
  });

  it("returns 404 when challenge not found", async () => {
    setDbRows([]);
    const res = await PUT(
      buildRequest("PUT", "/api/challenges/challenge-1", { title: "New Title" }),
      routeCtx
    );
    expect(res.status).toBe(404);
  });

  it("rejects non-creator", async () => {
    setSession(createMockSession({ user_id: "other-user" }));
    setDbRows([makeChallenge({ id: "challenge-1", creator_id: "user-creator" })]);

    const res = await PUT(
      buildRequest("PUT", "/api/challenges/challenge-1", { title: "New Title" }),
      routeCtx
    );
    expect(res.status).toBe(403);
  });

  it("rejects empty update", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await PUT(
      buildRequest("PUT", "/api/challenges/challenge-1", {}),
      routeCtx
    );
    expect(res.status).toBe(400);
  });

  it("updates challenge as creator", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    setMutationResult([makeChallenge({ id: "challenge-1", title: "Updated" })]);

    const res = await PUT(
      buildRequest("PUT", "/api/challenges/challenge-1", { title: "Updated Title Here" }),
      routeCtx
    );
    expect(res.status).toBe(200);
  });

  it("rejects badge_image_url with a non-http(s) scheme", async () => {
    setDbRows([makeChallenge({ id: "challenge-1" })]);
    const res = await PUT(
      buildRequest("PUT", "/api/challenges/challenge-1", {
        badge_image_url: "data:image/png;base64,iVBORw0KG",
      }),
      routeCtx
    );
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain("badge_image_url");
  });
});

describe("DELETE /api/challenges/[id]", () => {
  beforeEach(() => {
    setSession(createMockSession());
  });

  it("returns 404 when not found", async () => {
    setDbRows([]);
    const res = await DELETE(buildRequest("DELETE", "/api/challenges/challenge-1"), routeCtx);
    expect(res.status).toBe(404);
  });

  it("rejects non-creator", async () => {
    setSession(createMockSession({ user_id: "other-user" }));
    setDbRows([makeChallenge({ id: "challenge-1", creator_id: "user-creator" })]);

    const res = await DELETE(buildRequest("DELETE", "/api/challenges/challenge-1"), routeCtx);
    expect(res.status).toBe(403);
  });
});
