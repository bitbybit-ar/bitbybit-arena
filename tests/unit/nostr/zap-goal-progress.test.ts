/**
 * Unit tests for the zap-goal progress helper used by the funding bar.
 *
 * The HTTP route `/api/challenges/[id]/zap-goal-progress` is covered by
 * an integration test against a real DB. This file targets the pure-
 * logic concerns the integration test can't easily probe:
 *
 *   - the in-memory 45s TTL cache (a second call inside the window
 *     must NOT re-hit relays)
 *   - relay-failure does NOT poison the cache (next call retries)
 *   - missing `zap_goal_event_id` returns a zero-filled snapshot, not
 *     null
 *   - the batch helper dedupes overlapping ids and falls through to
 *     the same cache as the single-id helper
 *
 * The DB is mocked with a tiny chainable stub since the real query
 * shape is `select(...).from(...).where(...).limit(1)` for the single
 * call and `select(...).from(...).where(inArray(...))` for the batch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchZapReceiptsMock = vi.fn();

vi.mock("@/lib/nostr/fetch-zap-receipts", () => ({
  fetchZapReceipts: (...args: unknown[]) => fetchZapReceiptsMock(...args),
}));

const {
  computeZapGoalProgress,
  computeZapGoalProgressBatch,
} = await import("@/lib/nostr/zap-goal-progress");

interface ChallengeRow {
  id: string;
  zap_goal_event_id: string | null;
  prize_amount_sats: number | null;
}

function makeDb(rows: ChallengeRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
          // Used by the batch path (inArray + no .limit())
          then: (resolve: (v: ChallengeRow[]) => void) => resolve(rows),
        }),
      }),
    }),
  } as unknown as Parameters<typeof computeZapGoalProgress>[0];
}

const RECEIPT = {
  zapper_pubkey: "a".repeat(64),
  amount_sats: 5000,
  message: "for the goal",
  received_at: 1700000000,
};

beforeEach(() => {
  fetchZapReceiptsMock.mockReset();
});

describe("computeZapGoalProgress", () => {
  it("returns null when the challenge does not exist", async () => {
    const db = makeDb([]);
    const out = await computeZapGoalProgress(db, "no-such-challenge");
    expect(out).toBeNull();
  });

  it("returns a zero-filled snapshot when zap_goal_event_id is null", async () => {
    const id = `c-${Math.random()}`;
    const db = makeDb([
      { id, zap_goal_event_id: null, prize_amount_sats: 50_000 },
    ]);
    const out = await computeZapGoalProgress(db, id);
    expect(out).toEqual({
      challenge_id: id,
      goal_event_id: null,
      goal_sats: 50_000,
      raised_sats: 0,
      zapper_count: 0,
      recent_zappers: [],
    });
    expect(fetchZapReceiptsMock).not.toHaveBeenCalled();
  });

  it("aggregates receipts into raised_sats / zapper_count / recent_zappers", async () => {
    const id = `c-${Math.random()}`;
    const goalEventId = "b".repeat(64);
    const db = makeDb([
      { id, zap_goal_event_id: goalEventId, prize_amount_sats: 100_000 },
    ]);
    fetchZapReceiptsMock.mockResolvedValueOnce([
      RECEIPT,
      { ...RECEIPT, zapper_pubkey: "c".repeat(64), amount_sats: 2000 },
      // Same pubkey again — counts toward raised but not zapper_count.
      { ...RECEIPT, amount_sats: 1000 },
    ]);

    const out = await computeZapGoalProgress(db, id);
    expect(out!.raised_sats).toBe(8000);
    expect(out!.zapper_count).toBe(2);
    expect(out!.recent_zappers).toHaveLength(3);
  });

  it("caches a successful result for the TTL window", async () => {
    const id = `c-${Math.random()}`;
    const goalEventId = "d".repeat(64);
    const db = makeDb([
      { id, zap_goal_event_id: goalEventId, prize_amount_sats: 100_000 },
    ]);
    fetchZapReceiptsMock.mockResolvedValueOnce([RECEIPT]);

    const first = await computeZapGoalProgress(db, id);
    const second = await computeZapGoalProgress(db, id);

    expect(first).toEqual(second);
    // A relay round-trip is expensive; the second call must hit cache.
    expect(fetchZapReceiptsMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache a relay failure — the next call retries", async () => {
    const id = `c-${Math.random()}`;
    const goalEventId = "e".repeat(64);
    const db = makeDb([
      { id, zap_goal_event_id: goalEventId, prize_amount_sats: 100_000 },
    ]);
    fetchZapReceiptsMock.mockRejectedValueOnce(new Error("relay timeout"));

    const out1 = await computeZapGoalProgress(db, id);
    expect(out1!.raised_sats).toBe(0);

    // Second call: relay returns successfully. If the helper had
    // cached the failure, this would still report 0.
    fetchZapReceiptsMock.mockResolvedValueOnce([RECEIPT]);
    const out2 = await computeZapGoalProgress(db, id);
    expect(out2!.raised_sats).toBe(RECEIPT.amount_sats);
    expect(fetchZapReceiptsMock).toHaveBeenCalledTimes(2);
  });
});

describe("computeZapGoalProgressBatch", () => {
  it("returns an empty object for an empty input list", async () => {
    const db = makeDb([]);
    const out = await computeZapGoalProgressBatch(db, []);
    expect(out).toEqual({});
    expect(fetchZapReceiptsMock).not.toHaveBeenCalled();
  });

  it("returns null for ids that do not resolve to challenge rows", async () => {
    const id = `c-${Math.random()}`;
    const db = makeDb([]);
    const out = await computeZapGoalProgressBatch(db, [id]);
    expect(out[id]).toBeNull();
  });

  it("dedupes overlapping ids and shares one DB lookup", async () => {
    const id = `c-${Math.random()}`;
    const goalEventId = "f".repeat(64);
    const db = makeDb([
      { id, zap_goal_event_id: goalEventId, prize_amount_sats: 100_000 },
    ]);
    fetchZapReceiptsMock.mockResolvedValueOnce([RECEIPT]);

    const out = await computeZapGoalProgressBatch(db, [id, id, id]);
    expect(out[id]?.raised_sats).toBe(RECEIPT.amount_sats);
    // Only one relay round-trip even with three duplicate input ids.
    expect(fetchZapReceiptsMock).toHaveBeenCalledTimes(1);
  });
});
