import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NostrEvent } from "@/lib/nostr/types";

// Mock fetchFirstMatchingEvent so we can drive the two-stage flow without
// touching real relays. The mock returns whatever the test queues up for
// the next call(s), so we can verify both the targeted-then-fallback
// ordering and that the predicate is forwarded down.
const fetchFirstMatchingEventMock = vi.fn();
vi.mock("@/lib/nostr/fetch-events", () => ({
  fetchFirstMatchingEvent: fetchFirstMatchingEventMock,
}));

const { verifyHashtagPost } = await import("@/lib/nostr/verify-hashtag-post");

const baseEvent: NostrEvent = {
  id: "abc123",
  pubkey: "pk",
  created_at: 0,
  kind: 1,
  tags: [],
  content: "n/a",
  sig: "sig",
};

describe("verifyHashtagPost", () => {
  beforeEach(() => {
    fetchFirstMatchingEventMock.mockReset();
  });

  it("returns valid when the targeted query finds a lowercase tag match", async () => {
    fetchFirstMatchingEventMock.mockResolvedValueOnce({
      ...baseEvent,
      id: "match-1",
      tags: [["t", "pizzaday"]],
    });

    const result = await verifyHashtagPost({
      authorPubkey: "pk",
      hashtag: "pizzaday",
    });

    expect(result).toEqual({ valid: true, proofEventId: "match-1" });
    // Stage 2 (fallback) should not run when stage 1 already returned.
    expect(fetchFirstMatchingEventMock).toHaveBeenCalledTimes(1);
    const stage1 = fetchFirstMatchingEventMock.mock.calls[0];
    expect(stage1[0]["#t"]).toEqual(["pizzaday", "PIZZADAY", "Pizzaday"]);
  });

  it("falls back to the broader query when the targeted one returns nothing", async () => {
    fetchFirstMatchingEventMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...baseEvent,
        id: "match-2",
        tags: [["t", "PizzaDayXLaCrypta"]],
      });

    const result = await verifyHashtagPost({
      authorPubkey: "pk",
      hashtag: "pizzadayxlacrypta",
    });

    expect(result).toEqual({ valid: true, proofEventId: "match-2" });
    expect(fetchFirstMatchingEventMock).toHaveBeenCalledTimes(2);

    // Stage 2 must drop the `#t` filter so the relay returns kind:1
    // notes regardless of how the client cased the tag.
    const stage2 = fetchFirstMatchingEventMock.mock.calls[1];
    expect(stage2[0]["#t"]).toBeUndefined();
    expect(stage2[0].limit).toBe(50);

    // Both stages must pass a predicate so non-matching events stay
    // in the listening pool (instead of poisoning the result).
    expect(typeof fetchFirstMatchingEventMock.mock.calls[0][1].predicate).toBe(
      "function"
    );
    expect(typeof stage2[1].predicate).toBe("function");
  });

  it("returns invalid when both stages come up empty", async () => {
    fetchFirstMatchingEventMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await verifyHashtagPost({
      authorPubkey: "pk",
      hashtag: "neverposted",
    });

    expect(result).toEqual({ valid: false });
    expect(fetchFirstMatchingEventMock).toHaveBeenCalledTimes(2);
  });

  it("predicate matches case-insensitively against the event's `t` tags", async () => {
    fetchFirstMatchingEventMock.mockResolvedValueOnce(null);
    // Capture the predicate to assert directly.
    let capturedPredicate: ((e: NostrEvent) => boolean) | undefined;
    fetchFirstMatchingEventMock.mockImplementationOnce(
      async (_filter, options) => {
        capturedPredicate = options?.predicate;
        return null;
      }
    );

    // Use the realistic challenge hashtag from production. The predicate
    // must accept any casing of the FULL tag, but reject anything that
    // isn't the same hashtag — partial matches like "pizzaday" or
    // "pizzadayxlacryptaplus" must not pass, only the exact word folded.
    await verifyHashtagPost({
      authorPubkey: "pk",
      hashtag: "PizzaDayXLaCrypta",
    });

    expect(capturedPredicate).toBeDefined();
    // Equivalent casings of the same hashtag — all valid.
    expect(
      capturedPredicate!({
        ...baseEvent,
        tags: [["t", "pizzadayxlacrypta"]],
      })
    ).toBe(true);
    expect(
      capturedPredicate!({
        ...baseEvent,
        tags: [["t", "PIZZADAYXLACRYPTA"]],
      })
    ).toBe(true);
    expect(
      capturedPredicate!({
        ...baseEvent,
        tags: [["t", "PizzaDayXLaCrypta"]],
      })
    ).toBe(true);
    // Different word — not a match, even though it's a substring of the
    // configured hashtag.
    expect(
      capturedPredicate!({ ...baseEvent, tags: [["t", "pizzaday"]] })
    ).toBe(false);
    // Different word — superset of the hashtag.
    expect(
      capturedPredicate!({
        ...baseEvent,
        tags: [["t", "pizzadayxlacryptaplus"]],
      })
    ).toBe(false);
    // No `t` tags at all.
    expect(capturedPredicate!({ ...baseEvent, tags: [] })).toBe(false);
  });
});
