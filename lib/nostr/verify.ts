import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { NostrEventSchema } from "@/lib/schemas/nostr";
import type { NostrEvent } from "./types";

/**
 * Verify a Nostr event signature per NIP-01.
 * Reconstructs the event ID via SHA-256 of the canonical serialization,
 * then verifies the Schnorr signature against the pubkey.
 */
export function verifyNostrEvent(event: NostrEvent): boolean {
  try {
    const serialized = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
    ]);
    const hash = sha256(new TextEncoder().encode(serialized));
    const computedId = bytesToHex(hash);

    if (computedId !== event.id) {
      return false;
    }

    return schnorr.verify(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey)
    );
  } catch {
    return false;
  }
}

/**
 * Validate a NIP-42 authentication event (kind 22242).
 * Accepts `unknown` and shape-checks via NostrEventSchema first so the
 * route handler can hand us untyped JSON without needing a cast — a
 * malformed payload returns false here rather than crashing inside
 * verifyNostrEvent. Then: correct kind, recent timestamp (5 min
 * window), matching challenge, valid signature.
 */
export function validateAuthEvent(input: unknown, expectedChallenge: string): boolean {
  const parsed = NostrEventSchema.safeParse(input);
  if (!parsed.success) return false;
  const event = parsed.data;

  if (event.kind !== 22242) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > 300) return false;

  if (event.content !== expectedChallenge) return false;

  return verifyNostrEvent(event);
}
