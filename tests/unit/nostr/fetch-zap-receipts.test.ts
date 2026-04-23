import { describe, it, expect, vi } from "vitest";
import type { NostrEvent } from "@/lib/nostr/types";

// parseZapReceipt verifies Schnorr signatures on both the outer
// kind:9735 and the embedded kind:9734. This suite is about the
// parsing/guard logic, not crypto — generating real signed events
// for every fixture would add a keypair + sign step per test without
// exercising anything the pure Schnorr module hasn't already been
// audited for. Stubbing `verifyNostrEvent` to accept everything lets
// each case test exactly its own branch.
vi.mock("@/lib/nostr/verify", () => ({
  verifyNostrEvent: vi.fn(() => true),
}));

const { parseZapReceipt } = await import("@/lib/nostr/fetch-zap-receipts");

const GOAL_ID = "goal".padEnd(64, "0");
const ZAPPER_PUBKEY = "abc".padEnd(64, "0");
const RECIPIENT_PUBKEY = "fff".padEnd(64, "0");

// Minimal shape of the kind:9734 zap request embedded inside a 9735's
// `description` tag. Signature/id are irrelevant — parseZapReceipt
// reads `pubkey`, `content`, and the `amount` tag.
function buildZapRequest(
  amountMsats: number,
  content = ""
): NostrEvent {
  return {
    id: "req".padEnd(64, "0"),
    pubkey: ZAPPER_PUBKEY,
    created_at: 1_700_000_000,
    kind: 9734,
    content,
    sig: "",
    tags: [
      ["p", RECIPIENT_PUBKEY],
      ["e", GOAL_ID],
      ["amount", String(amountMsats)],
      ["relays", "wss://relay.damus.io"],
    ],
  };
}

function buildReceipt(params: {
  id?: string;
  receivedAt?: number;
  descriptionOverride?: unknown;
  kind?: number;
}): NostrEvent {
  const request = buildZapRequest(21_000);
  return {
    id: params.id ?? "receipt".padEnd(64, "0"),
    pubkey: RECIPIENT_PUBKEY,
    created_at: params.receivedAt ?? 1_700_000_100,
    kind: params.kind ?? 9735,
    content: "",
    sig: "",
    tags: [
      ["bolt11", "lnbc210u1..."],
      [
        "description",
        typeof params.descriptionOverride === "string"
          ? params.descriptionOverride
          : JSON.stringify(params.descriptionOverride ?? request),
      ],
      ["p", RECIPIENT_PUBKEY],
      ["e", GOAL_ID],
    ],
  };
}

describe("parseZapReceipt", () => {
  it("extracts zapper, amount, message, and received_at from a valid receipt", () => {
    const request = buildZapRequest(150_000, "go team");
    const receipt: NostrEvent = {
      ...buildReceipt({}),
      created_at: 1_700_000_500,
      tags: [
        ["bolt11", "lnbc150u1..."],
        ["description", JSON.stringify(request)],
        ["p", RECIPIENT_PUBKEY],
        ["e", GOAL_ID],
      ],
    };

    const parsed = parseZapReceipt(receipt);
    expect(parsed).not.toBeNull();
    expect(parsed!.receipt_id).toBe(receipt.id);
    expect(parsed!.zapper_pubkey).toBe(ZAPPER_PUBKEY);
    expect(parsed!.amount_sats).toBe(150);
    expect(parsed!.message).toBe("go team");
    expect(parsed!.received_at).toBe(1_700_000_500);
  });

  it("floors partial-sat amounts (1500 msats → 1 sat)", () => {
    const request = buildZapRequest(1_500);
    const receipt = buildReceipt({ descriptionOverride: request });
    const parsed = parseZapReceipt(receipt);
    expect(parsed?.amount_sats).toBe(1);
  });

  it("returns null for the wrong kind", () => {
    const receipt = buildReceipt({ kind: 1 });
    expect(parseZapReceipt(receipt)).toBeNull();
  });

  it("returns null when description is missing", () => {
    const receipt: NostrEvent = {
      id: "r".padEnd(64, "0"),
      pubkey: RECIPIENT_PUBKEY,
      created_at: 0,
      kind: 9735,
      content: "",
      sig: "",
      tags: [["bolt11", "lnbc1..."]],
    };
    expect(parseZapReceipt(receipt)).toBeNull();
  });

  it("returns null when description is not valid JSON", () => {
    const receipt = buildReceipt({ descriptionOverride: "{not json" });
    expect(parseZapReceipt(receipt)).toBeNull();
  });

  it("returns null when embedded event is not kind 9734", () => {
    const badRequest = { ...buildZapRequest(1000), kind: 1 };
    const receipt = buildReceipt({ descriptionOverride: badRequest });
    expect(parseZapReceipt(receipt)).toBeNull();
  });

  it("returns null when the amount tag is missing or non-numeric", () => {
    const request = buildZapRequest(1000);
    const noAmount: NostrEvent = {
      ...request,
      tags: request.tags.filter((t) => t[0] !== "amount"),
    };
    expect(
      parseZapReceipt(buildReceipt({ descriptionOverride: noAmount }))
    ).toBeNull();

    const nonNumeric: NostrEvent = {
      ...request,
      tags: request.tags.map((t) => (t[0] === "amount" ? ["amount", "abc"] : t)),
    };
    expect(
      parseZapReceipt(buildReceipt({ descriptionOverride: nonNumeric }))
    ).toBeNull();
  });

  it("returns null for zero or negative amounts", () => {
    const request = buildZapRequest(1000);
    const zero: NostrEvent = {
      ...request,
      tags: request.tags.map((t) => (t[0] === "amount" ? ["amount", "0"] : t)),
    };
    expect(parseZapReceipt(buildReceipt({ descriptionOverride: zero }))).toBeNull();

    const neg: NostrEvent = {
      ...request,
      tags: request.tags.map((t) =>
        t[0] === "amount" ? ["amount", "-500"] : t
      ),
    };
    expect(parseZapReceipt(buildReceipt({ descriptionOverride: neg }))).toBeNull();
  });

  it("handles an empty content field without throwing", () => {
    const receipt = buildReceipt({});
    const parsed = parseZapReceipt(receipt);
    expect(parsed?.message).toBe("");
  });

  it("rejects receipts whose outer kind:9735 signature doesn't verify", async () => {
    // First call = outer receipt verify. Fail it, and the rest of the
    // parse (including the embedded request) must be short-circuited.
    const verifyModule = await import("@/lib/nostr/verify");
    const mock = vi.mocked(verifyModule.verifyNostrEvent);
    mock.mockImplementationOnce(() => false); // outer receipt

    const receipt = buildReceipt({});
    expect(parseZapReceipt(receipt)).toBeNull();
  });

  it("rejects receipts whose embedded kind:9734 signature doesn't verify", async () => {
    // First call (outer) passes, second call (embedded) fails.
    const verifyModule = await import("@/lib/nostr/verify");
    const mock = vi.mocked(verifyModule.verifyNostrEvent);
    mock.mockImplementationOnce(() => true); // outer
    mock.mockImplementationOnce(() => false); // embedded

    const receipt = buildReceipt({});
    expect(parseZapReceipt(receipt)).toBeNull();
  });
});
