/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { cleanDb, testDb } from "./setup";
import { badges, participants } from "@/lib/db/schema";
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

const { POST, PATCH } = await import("@/app/api/challenges/[id]/award/route");

describe("Integration: Award badges", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let participant1: Awaited<ReturnType<typeof seedUser>>;
  let participant2: Awaited<ReturnType<typeof seedUser>>;
  let challenge: Awaited<ReturnType<typeof seedChallenge>>;

  beforeEach(async () => {
    await cleanDb();
    creator = await seedUser({ username: "creator" });
    participant1 = await seedUser({ username: "p1" });
    participant2 = await seedUser({ username: "p2" });
    challenge = await seedChallenge(creator.id, {
      title: "Award Test",
      badge_name: "Champion",
    });
    await seedParticipant(challenge.id, participant1.id);
    await seedParticipant(challenge.id, participant2.id);
  });

  it("awards badges to multiple participants", async () => {
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

    const res = await POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/award`, {
        user_ids: [participant1.id, participant2.id],
      }),
      { params: Promise.resolve({ id: challenge.id }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].badge_name).toBe("Champion");

    // Verify badges in DB
    const awardedBadges = await testDb
      .select()
      .from(badges)
      .where(eq(badges.challenge_id, challenge.id));
    expect(awardedBadges).toHaveLength(2);

    // Verify participants marked as completed
    const [p1] = await testDb
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.challenge_id, challenge.id),
          eq(participants.user_id, participant1.id)
        )
      );
    expect(p1.status).toBe("completed");
    expect(p1.completed_at).not.toBeNull();
  });

  it("rejects awarding from non-creator", async () => {
    setSession(makeSession(participant1.id));

    const res = await POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/award`, {
        user_ids: [participant2.id],
      }),
      { params: Promise.resolve({ id: challenge.id }) }
    );

    expect(res.status).toBe(403);
  });

  it("rejects awarding to non-participants", async () => {
    const outsider = await seedUser({ username: "outsider" });
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

    const res = await POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/award`, {
        user_ids: [outsider.id],
      }),
      { params: Promise.resolve({ id: challenge.id }) }
    );

    expect(res.status).toBe(400);
  });

  it("rejects duplicate badge award", async () => {
    setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

    // Award first time
    await POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/award`, {
        user_ids: [participant1.id],
      }),
      { params: Promise.resolve({ id: challenge.id }) }
    );

    // Try to award again
    const res = await POST(
      buildRequest("POST", `/api/challenges/${challenge.id}/award`, {
        user_ids: [participant1.id],
      }),
      { params: Promise.resolve({ id: challenge.id }) }
    );

    expect(res.status).toBe(409);
  });

  describe("PATCH /api/challenges/[id]/award — persist kind:8 event id", () => {
    const eventId = "c".repeat(64);

    it("stores nostr_event_id on the existing badge row", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      await POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/award`, {
          user_ids: [participant1.id],
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      const res = await PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/award`, {
          user_id: participant1.id,
          nostr_event_id: eventId,
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      expect(res.status).toBe(200);

      const [row] = await testDb
        .select()
        .from(badges)
        .where(
          and(
            eq(badges.challenge_id, challenge.id),
            eq(badges.user_id, participant1.id)
          )
        )
        .limit(1);
      expect(row.nostr_event_id).toBe(eventId);
    });

    it("404 when the user isn't a badge recipient for this challenge", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/award`, {
          user_id: participant1.id,
          nostr_event_id: eventId,
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(404);
    });

    it("403 when called by a non-creator", async () => {
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      await POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/award`, {
          user_ids: [participant1.id],
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );

      setSession(makeSession(participant1.id, { nostr_pubkey: participant1.nostr_pubkey }));
      const res = await PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/award`, {
          user_id: participant1.id,
          nostr_event_id: eventId,
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(403);
    });
  });
});
