/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanDb } from "./setup";
import {
  setSession, makeSession,
  seedUser, seedChallenge, seedParticipant, seedCompletion,
  buildRequest, parseResponse,
} from "./helpers";

vi.mock("@/lib/auth", async () => {
  const { sessionRef: ref } = await import("./helpers");
  return {
    getSession: vi.fn(() => Promise.resolve(ref.current)),
    AuthSession: {},
  };
});

vi.mock("@/lib/db", async () => {
  const { testDb } = await import("./setup");
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return { getDb: vi.fn(() => testDb), ...schema };
});

const challengesRoute = await import("@/app/api/challenges/route");
const challengeDetailRoute = await import("@/app/api/challenges/[id]/route");

describe("Integration: Challenges CRUD", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ username: "creator", display_name: "Creator" });
    setSession(makeSession(creator.id, { username: "creator", nostr_pubkey: creator.nostr_pubkey }));
  });

  describe("POST /api/challenges", () => {
    it("creates a challenge and persists it in the database", async () => {
      const res = await challengesRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Read 5 Books",
          description: "Read 5 books in one month to earn a badge",
          type: "streak",
          goal: 5,
          unit: "books",
        })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(201);
      expect(body.data.title).toBe("Read 5 Books");
      expect(body.data.creator_id).toBe(creator.id);
      expect(body.data.type).toBe("streak");
      expect(body.data.goal).toBe(5);
      expect(body.data.id).toBeDefined();

      // Verify we can fetch it
      const getRes = await challengeDetailRoute.GET(
        buildRequest("GET", `/api/challenges/${body.data.id}`),
        { params: Promise.resolve({ id: body.data.id }) }
      );
      const { status: getStatus, body: getBody } = await parseResponse(getRes);

      expect(getStatus).toBe(200);
      expect(getBody.data.title).toBe("Read 5 Books");
      expect(getBody.data.creator.username).toBe("creator");
      expect(getBody.data.participant_count).toBe(0);
    });
  });

  describe("GET /api/challenges", () => {
    it("lists challenges with creator info and participant count", async () => {
      const challenge = await seedChallenge(creator.id, { title: "Test Challenge" });
      const participant = await seedUser({ username: "participant1" });
      await seedParticipant(challenge.id, participant.id);

      setSession(null);
      const res = await challengesRoute.GET(buildRequest("GET", "/api/challenges"));
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe("Test Challenge");
      expect(body.data.items[0].participant_count).toBe(1);
      expect(body.data.items[0].creator.username).toBe("creator");
    });

    it("filters by status", async () => {
      await seedChallenge(creator.id, { title: "Open", status: "open" });
      await seedChallenge(creator.id, { title: "Cancelled", status: "cancelled", slug: "cancelled" });

      const res = await challengesRoute.GET(
        buildRequest("GET", "/api/challenges", undefined, { status: "open" })
      );
      const { body } = await parseResponse(res);

      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe("Open");
    });

    it("searches by title", async () => {
      await seedChallenge(creator.id, { title: "Running Marathon" });
      await seedChallenge(creator.id, { title: "Read Books", slug: "read-books" });

      const res = await challengesRoute.GET(
        buildRequest("GET", "/api/challenges", undefined, { search: "marathon" })
      );
      const { body } = await parseResponse(res);

      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe("Running Marathon");
    });

    it("sort=trending orders by recent joins + 2×completions, ignoring stale activity", async () => {
      const now = Date.now();
      const daysAgo = (n: number) => new Date(now - n * 86_400_000);

      // High-momentum: 1 recent join + 3 recent completions → score 7
      const hot = await seedChallenge(creator.id, { title: "Hot", slug: "hot" });
      const u1 = await seedUser({ username: "u1_trending" });
      await seedParticipant(hot.id, u1.id, { joined_at: daysAgo(2) });
      for (let i = 0; i < 3; i++) {
        const u = await seedUser({ username: `hot_c${i}` });
        await seedParticipant(hot.id, u.id, { joined_at: daysAgo(3) });
        await seedCompletion(hot.id, u.id, { submitted_at: daysAgo(1) });
      }

      // Medium: 5 recent joins, 0 completions → score 5
      const warm = await seedChallenge(creator.id, { title: "Warm", slug: "warm" });
      for (let i = 0; i < 5; i++) {
        const u = await seedUser({ username: `warm_j${i}` });
        await seedParticipant(warm.id, u.id, { joined_at: daysAgo(2) });
      }

      // Cold: all activity is outside the 7-day window → score 0
      const cold = await seedChallenge(creator.id, { title: "Cold", slug: "cold" });
      for (let i = 0; i < 10; i++) {
        const u = await seedUser({ username: `cold_j${i}` });
        await seedParticipant(cold.id, u.id, { joined_at: daysAgo(30) });
        await seedCompletion(cold.id, u.id, { submitted_at: daysAgo(30) });
      }

      setSession(null);
      const res = await challengesRoute.GET(
        buildRequest("GET", "/api/challenges", undefined, { sort: "trending" })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      const titles = body.data.items.map(
        (c: { title: string }) => c.title
      );
      expect(titles).toEqual(["Hot", "Warm", "Cold"]);
    });
  });

  describe("PUT /api/challenges/[id]", () => {
    it("updates challenge as creator", async () => {
      const challenge = await seedChallenge(creator.id, { title: "Old Title" });
      const ctx = { params: Promise.resolve({ id: challenge.id }) };

      const res = await challengeDetailRoute.PUT(
        buildRequest("PUT", `/api/challenges/${challenge.id}`, { title: "New Title Here" }),
        ctx
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.title).toBe("New Title Here");
    });

    it("rejects update from non-creator", async () => {
      const other = await seedUser({ username: "other" });
      const challenge = await seedChallenge(creator.id);
      setSession(makeSession(other.id));

      const res = await challengeDetailRoute.PUT(
        buildRequest("PUT", `/api/challenges/${challenge.id}`, { title: "Hacked" }),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/challenges/[id]", () => {
    it("deletes challenge with no active participants", async () => {
      const challenge = await seedChallenge(creator.id);
      const ctx = { params: Promise.resolve({ id: challenge.id }) };

      const res = await challengeDetailRoute.DELETE(
        buildRequest("DELETE", `/api/challenges/${challenge.id}`),
        ctx
      );

      expect(res.status).toBe(200);

      // Verify it's gone
      const getRes = await challengeDetailRoute.GET(
        buildRequest("GET", `/api/challenges/${challenge.id}`),
        ctx
      );
      expect(getRes.status).toBe(404);
    });

    it("rejects deletion when active participants exist", async () => {
      const challenge = await seedChallenge(creator.id);
      const participant = await seedUser({ username: "active_user" });
      await seedParticipant(challenge.id, participant.id, { status: "active" });

      const res = await challengeDetailRoute.DELETE(
        buildRequest("DELETE", `/api/challenges/${challenge.id}`),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      expect(res.status).toBe(400);
    });
  });
});
