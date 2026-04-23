/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanDb } from "./setup";
import {
  setSession,
  seedUser,
  seedChallenge,
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

// Stub the relay fetch so tests don't touch real relays. Each test
// controls what "receipts" the aggregator sees.
const fetchZapReceiptsMock = vi.fn();
vi.mock("@/lib/nostr/fetch-zap-receipts", () => ({
  fetchZapReceipts: (...args: unknown[]) => fetchZapReceiptsMock(...args),
}));

const progressRoute = await import(
  "@/app/api/challenges/[id]/zap-goal-progress/route"
);

const GOAL_ID = "goal".padEnd(64, "0");

describe("Integration: zap-goal-progress", () => {
  beforeEach(async () => {
    await cleanDb();
    fetchZapReceiptsMock.mockReset();
    // The route is public (no auth required); session stays null by
    // default so we catch regressions where the handler accidentally
    // starts requiring a login.
    setSession(null);
  });

  it("returns an empty-shaped snapshot when the challenge has no zap goal yet", async () => {
    const creator = await seedUser({ display_name: "Creator" });
    const challenge = await seedChallenge(creator.id, {
      prize_amount_sats: 5000,
      prize_distribution: "first_to_complete",
      zap_goal_event_id: null,
      status: "open",
    });

    const res = await progressRoute.GET(
      buildRequest("GET", `/api/challenges/${challenge.id}/zap-goal-progress`),
      { params: Promise.resolve({ id: challenge.id }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.goal_event_id).toBeNull();
    expect(body.data.goal_sats).toBe(5000);
    expect(body.data.raised_sats).toBe(0);
    expect(body.data.zapper_count).toBe(0);
    expect(body.data.recent_zappers).toEqual([]);
    // Must not hit relays when there's nothing to query.
    expect(fetchZapReceiptsMock).not.toHaveBeenCalled();
  });

  it("aggregates kind:9735 receipts into raised_sats, zapper_count, and recent_zappers sorted newest-first", async () => {
    const creator = await seedUser({ display_name: "Creator" });
    const challenge = await seedChallenge(creator.id, {
      prize_amount_sats: 10_000,
      prize_distribution: "split",
      zap_goal_event_id: GOAL_ID,
      status: "open",
    });

    fetchZapReceiptsMock.mockResolvedValueOnce([
      {
        receipt_id: "r1".padEnd(64, "0"),
        zapper_pubkey: "alice".padEnd(64, "0"),
        amount_sats: 1000,
        message: "first!",
        received_at: 1_700_000_300,
      },
      {
        receipt_id: "r2".padEnd(64, "0"),
        zapper_pubkey: "bob".padEnd(64, "0"),
        amount_sats: 2500,
        message: "",
        received_at: 1_700_000_200,
      },
      {
        // Alice zaps again — counts toward raised_sats, but
        // `zapper_count` dedupes to 2 unique zappers.
        receipt_id: "r3".padEnd(64, "0"),
        zapper_pubkey: "alice".padEnd(64, "0"),
        amount_sats: 500,
        message: "one more",
        received_at: 1_700_000_100,
      },
    ]);

    const res = await progressRoute.GET(
      buildRequest("GET", `/api/challenges/${challenge.id}/zap-goal-progress`),
      { params: Promise.resolve({ id: challenge.id }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.goal_event_id).toBe(GOAL_ID);
    expect(body.data.goal_sats).toBe(10_000);
    expect(body.data.raised_sats).toBe(4000);
    expect(body.data.zapper_count).toBe(2);
    expect(body.data.recent_zappers).toHaveLength(3);
    // Newest-first ordering mirrors the relay fetch result.
    expect(body.data.recent_zappers[0].message).toBe("first!");
    expect(body.data.recent_zappers[0].amount_sats).toBe(1000);
    expect(fetchZapReceiptsMock).toHaveBeenCalledWith(GOAL_ID);
  });

  it("404s for an unknown challenge id", async () => {
    const res = await progressRoute.GET(
      buildRequest(
        "GET",
        "/api/challenges/00000000-0000-0000-0000-000000000000/zap-goal-progress"
      ),
      {
        params: Promise.resolve({
          id: "00000000-0000-0000-0000-000000000000",
        }),
      }
    );
    expect(res.status).toBe(404);
  });

  it("serves an empty snapshot on relay failure instead of propagating the error", async () => {
    const creator = await seedUser({ display_name: "Creator" });
    const challenge = await seedChallenge(creator.id, {
      prize_amount_sats: 5000,
      prize_distribution: "first_to_complete",
      zap_goal_event_id: GOAL_ID,
      status: "open",
    });
    fetchZapReceiptsMock.mockRejectedValueOnce(new Error("relay_down"));

    const res = await progressRoute.GET(
      buildRequest("GET", `/api/challenges/${challenge.id}/zap-goal-progress`),
      { params: Promise.resolve({ id: challenge.id }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.raised_sats).toBe(0);
    expect(body.data.zapper_count).toBe(0);
  });
});
