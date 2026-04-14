/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { cleanDb, testDb } from "./setup";
import { challenges, completions, participants } from "@/lib/db/schema";
import {
  setSession,
  makeSession,
  seedUser,
  seedChallenge,
  seedParticipant,
  buildRequest,
  parseResponse,
} from "./helpers";

vi.mock("@/lib/auth", async () => {
  const { sessionRef } = await import("./helpers");
  return {
    getSession: vi.fn(() => Promise.resolve(sessionRef.current)),
    AuthSession: {},
  };
});

vi.mock("@/lib/db", async () => {
  const { testDb } = await import("./setup");
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>(
    "@/lib/db/schema"
  );
  return { getDb: vi.fn(() => testDb), ...schema };
});

// Mock the relay verifier so integration tests never hit real relays.
const verifyHashtagMock = vi.fn();
vi.mock("@/lib/nostr/verify-hashtag-post", () => ({
  verifyHashtagPost: (params: unknown) => verifyHashtagMock(params),
}));

const createChallengeRoute = await import("@/app/api/challenges/route");
const completionsRoute = await import(
  "@/app/api/challenges/[id]/completions/route"
);

const HASHTAG = "arenahackathon";
const PROOF_EVENT_ID = "c".repeat(64);

describe("Integration: Nostr hashtag verification", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let participant: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    verifyHashtagMock.mockReset();
    creator = await seedUser({ display_name: "Creator" });
    participant = await seedUser({
      display_name: "Poster",
      nostr_pubkey: "poster_pubkey",
    });
  });

  describe("POST /api/challenges — create nostr_hashtag challenge", () => {
    it("persists verification_methods and the hashtag", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await createChallengeRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Post your project",
          description: "Prove it by posting a kind:1 with the hashtag",
          type: "competition",
          verification_methods: ["nostr_hashtag"],
          nostr_hashtag: HASHTAG,
        })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(201);
      expect(body.data.verification_methods).toEqual(["nostr_hashtag"]);
      expect(body.data.nostr_hashtag).toBe(HASHTAG);
    });

    it("normalizes a leading hash and mixed case", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await createChallengeRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Post your project",
          description: "Hashtag normalization check",
          type: "competition",
          verification_methods: ["nostr_hashtag"],
          nostr_hashtag: "#ArenaHackathon",
        })
      );
      const { body } = await parseResponse(res);
      expect(body.data.nostr_hashtag).toBe("arenahackathon");
    });

    it("rejects nostr_hashtag without a valid hashtag", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await createChallengeRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Post your project",
          description: "Should reject a hashtag with invalid characters",
          type: "competition",
          verification_methods: ["nostr_hashtag"],
          nostr_hashtag: "bad hash!",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/challenges/[id]/completions — nostr_hashtag verification", () => {
    let challenge: Awaited<ReturnType<typeof seedChallenge>>;

    beforeEach(async () => {
      challenge = await seedChallenge(creator.id, {
        title: "Hashtag Challenge",
        status: "open",
        verification_methods: ["nostr_hashtag"],
        nostr_hashtag: HASHTAG,
        goal: 1,
      });
      await seedParticipant(challenge.id, participant.id, { status: "active" });
    });

    it("auto-approves when the verifier finds a matching post", async () => {
      verifyHashtagMock.mockResolvedValueOnce({
        valid: true,
        proofEventId: PROOF_EVENT_ID,
      });
      setSession(
        makeSession(participant.id, { nostr_pubkey: "poster_pubkey" })
      );

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {}),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(201);
      expect(body.data.status).toBe("approved");
      expect(body.data.proof_event_id).toBe(PROOF_EVENT_ID);
      expect(body.data.content).toBeNull();

      expect(verifyHashtagMock).toHaveBeenCalledWith({
        authorPubkey: "poster_pubkey",
        hashtag: HASHTAG,
      });

      const [p] = await testDb
        .select()
        .from(participants)
        .where(eq(participants.challenge_id, challenge.id));
      expect(p.progress).toBe(1);
      expect(p.status).toBe("completed");
    });

    it("rejects when no matching post is found", async () => {
      verifyHashtagMock.mockResolvedValueOnce({ valid: false });
      setSession(
        makeSession(participant.id, { nostr_pubkey: "poster_pubkey" })
      );

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {}),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(400);

      const rows = await testDb
        .select()
        .from(completions)
        .where(eq(completions.challenge_id, challenge.id));
      expect(rows).toHaveLength(0);
    });

    it("rejects when the challenge has no hashtag stored", async () => {
      const [broken] = await testDb
        .insert(challenges)
        .values({
          creator_id: creator.id,
          slug: `broken-${Date.now()}`,
          title: "Broken",
          description: "Missing hashtag for nostr_hashtag verification",
          verification_methods: ["nostr_hashtag"],
          nostr_hashtag: null,
        })
        .returning();
      await seedParticipant(broken.id, participant.id, { status: "active" });
      setSession(
        makeSession(participant.id, { nostr_pubkey: "poster_pubkey" })
      );

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${broken.id}/completions`, {}),
        { params: Promise.resolve({ id: broken.id }) }
      );
      expect(res.status).toBe(400);
      expect(verifyHashtagMock).not.toHaveBeenCalled();
    });
  });

  describe("dual method (nostr_hashtag + creator_approval)", () => {
    let challenge: Awaited<ReturnType<typeof seedChallenge>>;

    beforeEach(async () => {
      challenge = await seedChallenge(creator.id, {
        title: "Hackathon",
        status: "open",
        verification_methods: ["nostr_hashtag", "creator_approval"],
        nostr_hashtag: HASHTAG,
        goal: 1,
      });
      await seedParticipant(challenge.id, participant.id, { status: "active" });
    });

    it("rejects when no method is specified on a multi-method challenge", async () => {
      setSession(
        makeSession(participant.id, { nostr_pubkey: "poster_pubkey" })
      );

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {}),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(400);
      expect(verifyHashtagMock).not.toHaveBeenCalled();
    });

    it("accepts creator_approval fallback with text content when method is specified", async () => {
      setSession(
        makeSession(participant.id, { nostr_pubkey: "poster_pubkey" })
      );

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {
          method: "creator_approval",
          content: "Here is my project: https://github.com/me/cool-nostr-app",
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(201);
      // Manual approval path never auto-approves
      expect(body.data.status).toBe("pending");
      expect(body.data.content).toContain("cool-nostr-app");
      expect(verifyHashtagMock).not.toHaveBeenCalled();
    });

    it("runs the hashtag verifier when method=nostr_hashtag is specified", async () => {
      verifyHashtagMock.mockResolvedValueOnce({
        valid: true,
        proofEventId: PROOF_EVENT_ID,
      });
      setSession(
        makeSession(participant.id, { nostr_pubkey: "poster_pubkey" })
      );

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {
          method: "nostr_hashtag",
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(201);
      expect(body.data.status).toBe("approved");
      expect(verifyHashtagMock).toHaveBeenCalled();
    });
  });
});
