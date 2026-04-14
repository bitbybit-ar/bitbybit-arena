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
const verifyLikeMock = vi.fn();
vi.mock("@/lib/nostr/verify-like", () => ({
  verifyLikeForTarget: (params: unknown) => verifyLikeMock(params),
}));

const createChallengeRoute = await import("@/app/api/challenges/route");
const completionsRoute = await import(
  "@/app/api/challenges/[id]/completions/route"
);

const VALID_EVENT_ID = "a".repeat(64);
const PROOF_EVENT_ID = "b".repeat(64);

describe("Integration: Nostr action verification", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let participant: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    verifyLikeMock.mockReset();
    creator = await seedUser({ display_name: "Creator" });
    participant = await seedUser({
      display_name: "Liker",
      nostr_pubkey: "liker_pubkey",
    });
  });

  describe("POST /api/challenges — create nostr_action challenge", () => {
    it("persists verification_methods and target event id", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await createChallengeRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Like my note",
          description: "A challenge to verify likes via Nostr",
          type: "one_time",
          verification_methods: ["nostr_action"],
          nostr_action_target_event_id: VALID_EVENT_ID,
        })
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(201);
      expect(body.data.verification_methods).toEqual(["nostr_action"]);
      expect(body.data.nostr_action_target_event_id).toBe(VALID_EVENT_ID);
    });

    it("rejects nostr_action without a valid target event id", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await createChallengeRoute.POST(
        buildRequest("POST", "/api/challenges", {
          title: "Like my note",
          description: "A challenge to verify likes via Nostr",
          type: "one_time",
          verification_methods: ["nostr_action"],
          nostr_action_target_event_id: "not-hex",
        })
      );

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/challenges/[id]/completions — nostr_action verification", () => {
    let challenge: Awaited<ReturnType<typeof seedChallenge>>;

    beforeEach(async () => {
      challenge = await seedChallenge(creator.id, {
        title: "Like Challenge",
        status: "open",
        verification_methods: ["nostr_action"],
        nostr_action_target_event_id: VALID_EVENT_ID,
        goal: 1,
      });
      await seedParticipant(challenge.id, participant.id, { status: "active" });
    });

    it("auto-approves completion when the verifier finds the like", async () => {
      verifyLikeMock.mockResolvedValueOnce({
        valid: true,
        proofEventId: PROOF_EVENT_ID,
      });
      setSession(
        makeSession(participant.id, { nostr_pubkey: "liker_pubkey" })
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

      expect(verifyLikeMock).toHaveBeenCalledWith({
        likerPubkey: "liker_pubkey",
        targetEventId: VALID_EVENT_ID,
      });

      // Participant progress should have advanced and the participant marked
      // completed (goal = 1).
      const [p] = await testDb
        .select()
        .from(participants)
        .where(eq(participants.challenge_id, challenge.id));
      expect(p.progress).toBe(1);
      expect(p.status).toBe("completed");
      expect(p.completed_at).not.toBeNull();
    });

    it("rejects the completion when the verifier finds no matching like", async () => {
      verifyLikeMock.mockResolvedValueOnce({ valid: false });
      setSession(
        makeSession(participant.id, { nostr_pubkey: "liker_pubkey" })
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

    it("rejects duplicate proofs using the same like event id", async () => {
      verifyLikeMock.mockResolvedValue({
        valid: true,
        proofEventId: PROOF_EVENT_ID,
      });
      setSession(
        makeSession(participant.id, { nostr_pubkey: "liker_pubkey" })
      );

      // Create a second challenge with goal > 1 so the participant stays
      // active after the first completion.
      const multi = await seedChallenge(creator.id, {
        title: "Multi Like",
        status: "open",
        verification_methods: ["nostr_action"],
        nostr_action_target_event_id: VALID_EVENT_ID,
        goal: 5,
      });
      await seedParticipant(multi.id, participant.id, { status: "active" });

      const first = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${multi.id}/completions`, {}),
        { params: Promise.resolve({ id: multi.id }) }
      );
      expect(first.status).toBe(201);

      const second = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${multi.id}/completions`, {}),
        { params: Promise.resolve({ id: multi.id }) }
      );
      expect(second.status).toBe(400);
    });

    it("rejects completion when challenge has no target event id stored", async () => {
      // Sidestep the API validator by inserting directly with drizzle.
      const [broken] = await testDb
        .insert(challenges)
        .values({
          creator_id: creator.id,
          slug: `broken-${Date.now()}`,
          title: "Broken",
          description: "Missing target event id for nostr_action",
          verification_methods: ["nostr_action"],
          nostr_action_target_event_id: null,
        })
        .returning();
      await seedParticipant(broken.id, participant.id, { status: "active" });
      setSession(
        makeSession(participant.id, { nostr_pubkey: "liker_pubkey" })
      );

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${broken.id}/completions`, {}),
        { params: Promise.resolve({ id: broken.id }) }
      );
      expect(res.status).toBe(400);
      expect(verifyLikeMock).not.toHaveBeenCalled();
    });
  });
});
