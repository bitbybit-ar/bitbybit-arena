import { describe, it, expect } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { validateAuthEvent } from "@/lib/nostr/verify";

/**
 * Round-trip a real kind:22242 NIP-42 event through the validator.
 * The first iteration of `NostrEventSchema` typed `sig` as Hex64,
 * which rejected every actual Schnorr signature (128 hex chars) and
 * broke login on the deploy. This test exists to make sure the
 * happy path — sign the challenge, verify it server-side — never
 * regresses again.
 */
function signAuthEvent(challenge: string, createdAt?: number) {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const event = finalizeEvent(
    {
      kind: 22242,
      created_at: createdAt ?? Math.floor(Date.now() / 1000),
      tags: [],
      content: challenge,
    },
    sk
  );
  return { event, pubkey };
}

describe("validateAuthEvent", () => {
  it("accepts a freshly signed kind:22242 event whose content matches the challenge", () => {
    const challenge = "a".repeat(64);
    const { event } = signAuthEvent(challenge);

    const result = validateAuthEvent(event, challenge);
    expect(result.ok).toBe(true);
  });

  it("rejects with reason=schema when the signed event is missing fields", () => {
    const result = validateAuthEvent(
      { pubkey: "a".repeat(64) },
      "challenge"
    );
    expect(result).toEqual({ ok: false, reason: "schema" });
  });

  it("rejects with reason=schema when sig is 64 hex (the old buggy contract)", () => {
    // A Schnorr signature is 128 hex chars. If Hex64Schema sneaks back
    // onto `sig`, a 128-hex real sig would be rejected. This test
    // guards the inverse: a 64-hex sig must NOT be accepted.
    const fakeEvent = {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      sig: "c".repeat(64), // wrong length — real sigs are 128
      created_at: Math.floor(Date.now() / 1000),
      kind: 22242,
      content: "challenge",
      tags: [],
    };
    const result = validateAuthEvent(fakeEvent, "challenge");
    expect(result).toEqual({ ok: false, reason: "schema" });
  });

  it("rejects with reason=kind when the event isn't kind 22242", () => {
    const challenge = "a".repeat(64);
    const { event } = signAuthEvent(challenge);
    const wrongKind = { ...event, kind: 1 };

    const result = validateAuthEvent(wrongKind, challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("kind");
  });

  it("rejects with reason=clock when created_at is more than 5 minutes off", () => {
    const challenge = "a".repeat(64);
    const now = Math.floor(Date.now() / 1000);
    const { event } = signAuthEvent(challenge, now - 10 * 60);

    const result = validateAuthEvent(event, challenge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("clock");
  });

  it("rejects with reason=challenge when content doesn't match", () => {
    const { event } = signAuthEvent("a".repeat(64));

    const result = validateAuthEvent(event, "b".repeat(64));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("challenge");
  });
});
