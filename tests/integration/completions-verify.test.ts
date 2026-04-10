import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { cleanDb, testDb } from "./setup";
import { participants } from "@/lib/db/schema";
import {
  setSession, makeSession,
  seedUser, seedChallenge, seedParticipant, seedCompletion,
  buildRequest, parseResponse,
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
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return { getDb: vi.fn(() => testDb), ...schema };
});

const completionsRoute = await import("@/app/api/challenges/[id]/completions/route");
const verifyRoute = await import("@/app/api/completions/[id]/verify/route");

describe("Integration: Completions & Verify", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let participant: Awaited<ReturnType<typeof seedUser>>;
  let challenge: Awaited<ReturnType<typeof seedChallenge>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ username: "creator", display_name: "Creator" });
    participant = await seedUser({ username: "doer", display_name: "Doer" });
    challenge = await seedChallenge(creator.id, {
      title: "Complete Test",
      status: "open",
      verification_type: "creator_approval",
      goal: 2,
    });
    await seedParticipant(challenge.id, participant.id, { status: "active" });
  });

  describe("POST /api/challenges/[id]/completions — submit proof", () => {
    it("submits proof as active participant", async () => {
      setSession(makeSession(participant.id, { username: "doer" }));

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {
          content: "Here is my proof of completion",
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(201);
      expect(body.data.status).toBe("pending");
      expect(body.data.challenge_id).toBe(challenge.id);
      expect(body.data.user_id).toBe(participant.id);
    });

    it("rejects proof from non-participant", async () => {
      const outsider = await seedUser({ username: "outsider" });
      setSession(makeSession(outsider.id));

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {
          content: "I didn't even join!",
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      expect(res.status).toBe(403);
    });

    it("rejects content shorter than 5 chars", async () => {
      setSession(makeSession(participant.id));

      const res = await completionsRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/completions`, {
          content: "hi",
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/challenges/[id]/completions — list", () => {
    it("lists completions with user info", async () => {
      await seedCompletion(challenge.id, participant.id, { content: "My proof" });
      setSession(null);

      const res = await completionsRoute.GET(
        buildRequest("GET", `/api/challenges/${challenge.id}/completions`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].content).toBe("My proof");
      expect(body.data[0].user.username).toBe("doer");
    });
  });

  describe("POST /api/completions/[id]/verify — approve/reject", () => {
    it("approves a completion and updates participant progress", async () => {
      const completion = await seedCompletion(challenge.id, participant.id, { status: "pending" });
      setSession(makeSession(creator.id, { username: "creator", nostr_pubkey: creator.nostr_pubkey }));

      const res = await verifyRoute.POST(
        buildRequest("POST", `/api/completions/${completion.id}/verify`, { status: "approved" }),
        { params: Promise.resolve({ id: completion.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.status).toBe("approved");
      expect(body.data.reviewed_by).toBe(creator.id);

      // Verify participant progress was updated
      const [updated] = await testDb
        .select()
        .from(participants)
        .where(eq(participants.user_id, participant.id))
        .limit(1);

      expect(updated.progress).toBe(1);
      expect(updated.status).toBe("active"); // goal is 2, only 1 done
    });

    it("marks participant completed when goal is reached", async () => {
      // Update existing participant progress to 1 (goal is 2)
      await testDb
        .update(participants)
        .set({ progress: 1 })
        .where(eq(participants.user_id, participant.id));

      const completion = await seedCompletion(challenge.id, participant.id, { status: "pending" });
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      await verifyRoute.POST(
        buildRequest("POST", `/api/completions/${completion.id}/verify`, { status: "approved" }),
        { params: Promise.resolve({ id: completion.id }) }
      );

      const [updated] = await testDb
        .select()
        .from(participants)
        .where(eq(participants.user_id, participant.id))
        .limit(1);

      expect(updated.progress).toBe(2);
      expect(updated.status).toBe("completed");
      expect(updated.completed_at).not.toBeNull();
    });

    it("rejects verification from non-creator", async () => {
      const completion = await seedCompletion(challenge.id, participant.id, { status: "pending" });
      setSession(makeSession(participant.id));

      const res = await verifyRoute.POST(
        buildRequest("POST", `/api/completions/${completion.id}/verify`, { status: "approved" }),
        { params: Promise.resolve({ id: completion.id }) }
      );

      expect(res.status).toBe(403);
    });

    it("rejects verifying already-reviewed completion", async () => {
      const completion = await seedCompletion(challenge.id, participant.id, { status: "approved" });
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await verifyRoute.POST(
        buildRequest("POST", `/api/completions/${completion.id}/verify`, { status: "approved" }),
        { params: Promise.resolve({ id: completion.id }) }
      );

      expect(res.status).toBe(400);
    });

    it("rejects a completion without updating progress", async () => {
      const completion = await seedCompletion(challenge.id, participant.id, { status: "pending" });
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await verifyRoute.POST(
        buildRequest("POST", `/api/completions/${completion.id}/verify`, { status: "rejected" }),
        { params: Promise.resolve({ id: completion.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.status).toBe("rejected");

      const [unchanged] = await testDb
        .select()
        .from(participants)
        .where(eq(participants.user_id, participant.id))
        .limit(1);

      expect(unchanged.progress).toBe(0);
    });
  });
});
