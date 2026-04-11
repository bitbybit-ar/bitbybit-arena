import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildRequest, parseResponse, createMockSession, mockState,
  setSession, setDbRows, setMutationResult, setupDbMock, makeChallenge, makeUser,
} from "../helpers";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(() => Promise.resolve(mockState.session)),
  AuthSession: {},
}));
vi.mock("@/lib/db", () => setupDbMock());

const { GET, POST } = await import("@/app/api/challenges/route");

describe("GET /api/challenges", () => {
  beforeEach(() => {
    setSession(createMockSession());
    setDbRows([]);
  });

  it("returns empty list when no challenges", async () => {
    const res = await GET(buildRequest("GET", "/api/challenges"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.items).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });

  it("returns challenges with creator info", async () => {
    const creator = makeUser({ id: "user-creator" });
    setDbRows([{
      challenge: makeChallenge(),
      creator: { id: creator.id, username: creator.username, display_name: creator.display_name, avatar_url: null, nostr_pubkey: creator.nostr_pubkey },
      participant_count: 5,
    }]);

    const res = await GET(buildRequest("GET", "/api/challenges"));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].participant_count).toBe(5);
    expect(body.data.items[0].creator).toBeDefined();
  });

  it("works without auth (public endpoint)", async () => {
    setSession(null);
    setDbRows([]);
    const res = await GET(buildRequest("GET", "/api/challenges"));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/challenges", () => {
  beforeEach(() => {
    setSession(createMockSession());
    setMutationResult([]);
  });

  it("requires authentication", async () => {
    setSession(null);
    const res = await POST(buildRequest("POST", "/api/challenges", {
      title: "Valid Title", description: "Valid description here",
    }));
    expect(res.status).toBe(401);
  });

  it("rejects title shorter than 3 chars", async () => {
    const res = await POST(buildRequest("POST", "/api/challenges", {
      title: "ab", description: "Valid description that is long enough",
    }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain("Title");
  });

  it("rejects description shorter than 10 chars", async () => {
    const res = await POST(buildRequest("POST", "/api/challenges", {
      title: "Valid Title", description: "short",
    }));
    const { body } = await parseResponse(res);
    expect(body.error).toContain("Description");
  });

  it("rejects invalid challenge type", async () => {
    const res = await POST(buildRequest("POST", "/api/challenges", {
      title: "Valid", description: "Valid description here", type: "invalid",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects community_vote as verification method", async () => {
    const res = await POST(buildRequest("POST", "/api/challenges", {
      title: "Valid", description: "Valid description here", verification_methods: ["community_vote"],
    }));
    expect(res.status).toBe(400);
  });

  it("creates challenge with valid data", async () => {
    setMutationResult([makeChallenge({ title: "Meditation" })]);
    const res = await POST(buildRequest("POST", "/api/challenges", {
      title: "Meditation Challenge",
      description: "Meditate every day for 30 days",
      type: "streak",
      goal: 30,
      unit: "days",
    }));
    expect(res.status).toBe(201);
  });
});
