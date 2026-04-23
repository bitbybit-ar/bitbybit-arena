/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { cleanDb, testDb } from "./setup";
import { challenges, participants, completions } from "@/lib/db/schema";
import {
  setSession,
  makeSession,
  seedUser,
  seedChallenge,
  seedParticipant,
  seedCompletion,
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

// Stub the relay metadata fetcher so tests never hit real relays. We
// mainly care that the endpoint handles the "user has no lud16" branch
// and that it falls back to metadata when the users row is missing it.
const metadataMock = vi.fn();
vi.mock("@/lib/nostr/server-metadata", () => ({
  fetchNostrMetadataServer: (...args: unknown[]) => metadataMock(...args),
}));

const rewardRoute = await import("@/app/api/challenges/[id]/reward/route");

const REAL_RECEIPT_ID = "c".repeat(64);

async function markParticipantCompleted(participantId: string, secondsAgo = 0) {
  await testDb
    .update(participants)
    .set({
      status: "completed",
      completed_at: new Date(Date.now() - secondsAgo * 1000),
    })
    .where(eq(participants.id, participantId));
}

describe("Integration: Zap rewards", () => {
  let creator: Awaited<ReturnType<typeof seedUser>>;
  let winnerA: Awaited<ReturnType<typeof seedUser>>;
  let winnerB: Awaited<ReturnType<typeof seedUser>>;
  let winnerC: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await cleanDb();
    metadataMock.mockReset();
    creator = await seedUser({ display_name: "Creator" });
    winnerA = await seedUser({
      display_name: "Alice",
      lightning_address: "alice@getalby.com",
    });
    winnerB = await seedUser({
      display_name: "Bob",
      lightning_address: "bob@strike.me",
    });
    winnerC = await seedUser({
      display_name: "Carol",
      lightning_address: "carol@walletofsatoshi.com",
    });
  });

  describe("POST /api/challenges/[id]/reward", () => {
    it("first_to_complete: returns the earliest completer with the full pot", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 5000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      const pA = await seedParticipant(challenge.id, winnerA.id, {
        status: "active",
      });
      const pB = await seedParticipant(challenge.id, winnerB.id, {
        status: "active",
      });
      await markParticipantCompleted(pB.id, 20); // earliest
      await markParticipantCompleted(pA.id, 10);

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.winners).toHaveLength(1);
      expect(body.data.winners[0].user_id).toBe(winnerB.id);
      expect(body.data.winners[0].amount_sats).toBe(5000);
      expect(body.data.winners[0].lightning_address).toBe("bob@strike.me");
    });

    it("split: divides the pot evenly among all completers, remainder to the first", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1001,
        prize_distribution: "split",
        status: "open",
      });
      const pA = await seedParticipant(challenge.id, winnerA.id, { status: "active" });
      const pB = await seedParticipant(challenge.id, winnerB.id, { status: "active" });
      const pC = await seedParticipant(challenge.id, winnerC.id, { status: "active" });
      await markParticipantCompleted(pA.id, 30); // earliest
      await markParticipantCompleted(pB.id, 20);
      await markParticipantCompleted(pC.id, 10);

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { body } = await parseResponse(res);
      expect(body.data.winners).toHaveLength(3);
      const total = body.data.winners.reduce(
        (sum: number, w: { amount_sats: number }) => sum + w.amount_sats,
        0
      );
      expect(total).toBe(1001);
      // Remainder (1001 % 3 = 2) goes to the first-place winner (alice).
      expect(body.data.winners[0].user_id).toBe(winnerA.id);
      expect(body.data.winners[0].amount_sats).toBe(335);
    });

    it("tiered: 50/30/20 to top 3 by completion time", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 10000,
        prize_distribution: "tiered",
        status: "open",
      });
      const pA = await seedParticipant(challenge.id, winnerA.id, { status: "active" });
      const pB = await seedParticipant(challenge.id, winnerB.id, { status: "active" });
      const pC = await seedParticipant(challenge.id, winnerC.id, { status: "active" });
      await markParticipantCompleted(pA.id, 30);
      await markParticipantCompleted(pB.id, 20);
      await markParticipantCompleted(pC.id, 10);

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { body } = await parseResponse(res);
      expect(body.data.winners).toHaveLength(3);
      expect(body.data.winners[0].amount_sats).toBe(5000);
      expect(body.data.winners[1].amount_sats).toBe(3000);
      expect(body.data.winners[2].amount_sats).toBe(2000);
    });

    it("falls back to kind:0 metadata when the users row has no lud16", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      const nolnUser = await seedUser({
        display_name: "NoLN",
        lightning_address: null,
      });
      const p = await seedParticipant(challenge.id, nolnUser.id, {
        status: "active",
      });
      await markParticipantCompleted(p.id);
      metadataMock.mockResolvedValueOnce({ lud16: "noln@example.com" });

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(200);
      expect(metadataMock).toHaveBeenCalledWith(nolnUser.nostr_pubkey);
      expect(body.data.winners[0].lightning_address).toBe("noln@example.com");
    });

    it("400 when a winner has no lightning address anywhere", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      const nolnUser = await seedUser({
        display_name: "NoLN2",
        lightning_address: null,
      });
      const p = await seedParticipant(challenge.id, nolnUser.id, {
        status: "active",
      });
      await markParticipantCompleted(p.id);
      metadataMock.mockResolvedValueOnce(null);

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(400);
    });

    it("403 for non-creators", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      const p = await seedParticipant(challenge.id, winnerA.id, {
        status: "active",
      });
      await markParticipantCompleted(p.id);

      setSession(makeSession(winnerA.id, { nostr_pubkey: winnerA.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(403);
    });

    it("400 when no one has completed", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      await seedParticipant(challenge.id, winnerA.id, { status: "active" });
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(400);
    });

    it("creator who participates wins first_to_complete as retained (no payout)", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 5000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      // Creator-as-participant: finished first. Winner A is second.
      const pCreator = await seedParticipant(challenge.id, creator.id, {
        status: "active",
      });
      const pA = await seedParticipant(challenge.id, winnerA.id, {
        status: "active",
      });
      await markParticipantCompleted(pCreator.id, 30);
      await markParticipantCompleted(pA.id, 10);

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(200);
      expect(body.data.winners).toHaveLength(1);
      expect(body.data.winners[0].user_id).toBe(creator.id);
      expect(body.data.winners[0].retained).toBe(true);
      // Retained entries come back with a null lightning_address since
      // no payout will be issued — the endpoint must not throw 400 for a
      // "missing" LN address on the creator.
      expect(body.data.winners[0].lightning_address).toBeNull();
      // Metadata lookup must be skipped entirely for the creator.
      expect(metadataMock).not.toHaveBeenCalled();
    });

    it("tiered: creator in top 3 is retained, other winners are payable", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 10000,
        prize_distribution: "tiered",
        status: "open",
      });
      const pCreator = await seedParticipant(challenge.id, creator.id, {
        status: "active",
      });
      const pA = await seedParticipant(challenge.id, winnerA.id, { status: "active" });
      const pB = await seedParticipant(challenge.id, winnerB.id, { status: "active" });
      // Creator wins 2nd place (30%), winnerA wins 1st (50%), winnerB wins 3rd (20%).
      await markParticipantCompleted(pA.id, 30);
      await markParticipantCompleted(pCreator.id, 20);
      await markParticipantCompleted(pB.id, 10);

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { body } = await parseResponse(res);
      expect(body.data.winners).toHaveLength(3);

      const creatorEntry = body.data.winners.find(
        (w: { user_id: string }) => w.user_id === creator.id
      );
      expect(creatorEntry.retained).toBe(true);
      expect(creatorEntry.amount_sats).toBe(3000);

      const payableTotal = body.data.winners
        .filter((w: { retained: boolean }) => !w.retained)
        .reduce((sum: number, w: { amount_sats: number }) => sum + w.amount_sats, 0);
      expect(payableTotal).toBe(7000);
    });

    it("400 when prize_distribution is 'none'", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "none",
        status: "open",
      });
      const p = await seedParticipant(challenge.id, winnerA.id, {
        status: "active",
      });
      await markParticipantCompleted(p.id);

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.POST(
        buildRequest("POST", `/api/challenges/${challenge.id}/reward`),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.error).toContain("payout-eligible");
    });
  });

  describe("PATCH /api/challenges/[id]/reward", () => {
    it("sets rewards_paid_at when all_winners_paid is true", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await rewardRoute.PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/reward`, {
          all_winners_paid: true,
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(200);

      const [updated] = await testDb
        .select()
        .from(challenges)
        .where(eq(challenges.id, challenge.id));
      expect(updated.rewards_paid_at).not.toBeNull();
    });

    it("400 on empty body — caller must request an action explicitly", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));

      const res = await rewardRoute.PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/reward`, {}),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(400);

      // rewards_paid_at must stay null — the whole point of the fix.
      const [updated] = await testDb
        .select()
        .from(challenges)
        .where(eq(challenges.id, challenge.id));
      expect(updated.rewards_paid_at).toBeNull();
    });

    it("stores a receipt id on the winner's latest approved completion without flipping rewards_paid_at", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      const p = await seedParticipant(challenge.id, winnerA.id, {
        status: "active",
      });
      await markParticipantCompleted(p.id);
      await seedCompletion(challenge.id, winnerA.id, {
        status: "approved",
        content: "Proof of completion",
      });

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/reward`, {
          user_id: winnerA.id,
          receipt_event_id: REAL_RECEIPT_ID,
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(200);

      const [row] = await testDb
        .select()
        .from(completions)
        .where(eq(completions.user_id, winnerA.id));
      expect(row.reward_zap_receipt_id).toBe(REAL_RECEIPT_ID);

      // No `all_winners_paid: true` in the body — the challenge must
      // NOT be marked paid yet.
      const [updated] = await testDb
        .select()
        .from(challenges)
        .where(eq(challenges.id, challenge.id));
      expect(updated.rewards_paid_at).toBeNull();
    });

    it("records a receipt AND flips rewards_paid_at when both signals are present", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      const p = await seedParticipant(challenge.id, winnerA.id, {
        status: "active",
      });
      await markParticipantCompleted(p.id);
      await seedCompletion(challenge.id, winnerA.id, {
        status: "approved",
        content: "Proof of completion",
      });

      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/reward`, {
          user_id: winnerA.id,
          receipt_event_id: REAL_RECEIPT_ID,
          all_winners_paid: true,
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(200);

      const [row] = await testDb
        .select()
        .from(completions)
        .where(eq(completions.user_id, winnerA.id));
      expect(row.reward_zap_receipt_id).toBe(REAL_RECEIPT_ID);

      const [updated] = await testDb
        .select()
        .from(challenges)
        .where(eq(challenges.id, challenge.id));
      expect(updated.rewards_paid_at).not.toBeNull();
    });

    it("400 when receipt_event_id is not 64-hex", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      setSession(makeSession(creator.id, { nostr_pubkey: creator.nostr_pubkey }));
      const res = await rewardRoute.PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/reward`, {
          user_id: winnerA.id,
          receipt_event_id: "not-hex",
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(400);
    });

    it("403 for non-creators", async () => {
      const challenge = await seedChallenge(creator.id, {
        prize_amount_sats: 1000,
        prize_distribution: "first_to_complete",
        status: "open",
      });
      setSession(makeSession(winnerA.id, { nostr_pubkey: winnerA.nostr_pubkey }));
      const res = await rewardRoute.PATCH(
        buildRequest("PATCH", `/api/challenges/${challenge.id}/reward`, {
          all_winners_paid: true,
        }),
        { params: Promise.resolve({ id: challenge.id }) }
      );
      expect(res.status).toBe(403);
    });
  });
});
