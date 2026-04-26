import { describe, it, expect } from "vitest";
import { bech32 } from "@scure/base";
import { extractPaymentHash } from "@/lib/lightning";

// We don't have a guaranteed-stable real BOLT11 vector that decodes
// cleanly under @scure/base, so the round-trip test builds a fake
// "BOLT11-shaped" bech32 message: 7-word timestamp + a single tagged
// `p` field carrying a known payment hash + 104 placeholder signature
// words. extractPaymentHash only looks at the `p` field, so this
// reproduces the exact wire shape it parses.
function buildFakeInvoiceWithHash(hexHash: string): string {
  const hashBytes = new Uint8Array(
    hexHash.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const hashWords = bech32.toWords(hashBytes); // 32 bytes → 52 5-bit words

  const timestamp = new Array(7).fill(0); // 7 words = 35 bits
  // Tag layout: type(1) + len_msb(1) + len_lsb(1) + 52 data words
  const pTag = [1, 1, 20, ...hashWords]; // (1<<5) | 20 = 52 = correct length
  const sig = new Array(104).fill(0); // BOLT11 signature: 64 bytes + 1-word recovery flag = 104 words

  const allWords = [...timestamp, ...pTag, ...sig];
  return bech32.encode("lnbc", allWords, 2000);
}

describe("extractPaymentHash", () => {
  it("returns null for a string that is not a BOLT11 invoice", () => {
    expect(extractPaymentHash("not-an-invoice")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractPaymentHash("")).toBeNull();
  });

  it("returns null on malformed bech32 data", () => {
    // bech32 decode throws; the helper catches and returns null.
    expect(extractPaymentHash("lnbc1abc!!!")).toBeNull();
  });

  it("extracts the payment hash from a BOLT11-shaped bech32 message", () => {
    const expected =
      "0001020304050607080900010203040506070809000102030405060708090102";
    const invoice = buildFakeInvoiceWithHash(expected);
    expect(extractPaymentHash(invoice)).toBe(expected);
  });

  it("returns null when the invoice has no payment-hash tag", () => {
    // Same shape but without the `p` tag — just timestamp + signature.
    const timestamp = new Array(7).fill(0);
    const sig = new Array(104).fill(0);
    const noHashInvoice = bech32.encode(
      "lnbc",
      [...timestamp, ...sig],
      2000
    );
    expect(extractPaymentHash(noHashInvoice)).toBeNull();
  });
});
