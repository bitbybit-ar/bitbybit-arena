/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanDb } from "./setup";
import {
  setSession, makeSession,
  seedUser, seedChallenge, seedParticipant,
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

const { POST, DELETE } = await import("@/app/api/challenges/[id]/join/route");

describe("Integration: Join / Withdraw", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let participant: Awaited<ReturnType<typeof seedUser>>;
  let challenge: Awaited<ReturnType<typeof seedChallenge>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ username: "creator", display_name: "Creator" });
    participant = await seedUser({ username: "joiner", display_name: "Joiner" });
    challenge = await seedChallenge(creator.id, { title: "Join Test", status: "open" });
  });

  describe("POST /api/challenges/[id]/join", () => {
    it("joins a challenge successfully", async () => {
      setSession(makeSession(participant.id, { username: "joiner", nostr_pubkey: participant.nostr_pubkey }));
      const ctx = { params: Promise.resolve({ id: challenge.id }) };

      const res = await POST(buildRequest("POST", `/api/challenges/${challenge.id}/join`), ctx);
      const { status, body } = await parseResponse(res);

      expect(status).toBe(201);
      expect(body.data.challenge_id).toBe(challenge.id);
      expect(body.data.user_id).toBe(participant.id);
      expect(body.data.status).toBe("active");
    });

    it("rejects joining own challenge", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/join`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(400);
      expect(body.error).toContain("own challenge");
    });

    it("rejects duplicate join", async () => {
      setSession(makeSession(participant.id));
      await seedParticipant(challenge.id, participant.id, { status: "active" });

      const res = await POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/join`),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      expect(res.status).toBe(409);
    });

    it("allows rejoin after withdrawal", async () => {
      setSession(makeSession(participant.id));
      await seedParticipant(challenge.id, participant.id, { status: "withdrawn", progress: 3 });

      const res = await POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/join`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.status).toBe("active");
      expect(body.data.progress).toBe(0);
    });

    it("rejects joining a cancelled challenge", async () => {
      const cancelled = await seedChallenge(creator.id, { status: "cancelled", slug: "cancelled" });
      setSession(makeSession(participant.id));

      const res = await POST(
        buildRequest("POST", `/api/challenges/${cancelled.id}/join`),
        { params: Promise.resolve({ id: cancelled.id }) }
      );

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/challenges/[id]/join", () => {
    it("withdraws an active participant", async () => {
      setSession(makeSession(participant.id));
      await seedParticipant(challenge.id, participant.id, { status: "active" });

      const res = await DELETE(
        buildRequest("DELETE", `/api/challenges/${challenge.id}/join`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.status).toBe("withdrawn");
    });

    it("rejects withdrawing from completed participation", async () => {
      setSession(makeSession(participant.id));
      await seedParticipant(challenge.id, participant.id, { status: "completed" });

      const res = await DELETE(
        buildRequest("DELETE", `/api/challenges/${challenge.id}/join`),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      expect(res.status).toBe(400);
    });

    it("returns 404 when not a participant", async () => {
      setSession(makeSession(participant.id));

      const res = await DELETE(
        buildRequest("DELETE", `/api/challenges/${challenge.id}/join`),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      expect(res.status).toBe(404);
    });
  });
});
