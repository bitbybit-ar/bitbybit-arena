/**
 * Client-side nsec login: decode nsec, derive pubkey, sign challenge event.
 * The private key is never sent to the server — only the signed event is.
 */

import { decode } from "nostr-tools/nip19";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { hexToBytes } from "nostr-tools/utils";

interface NsecLoginResult {
  signedEvent: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  };
}

/**
 * Parse an nsec (bech32) or hex private key string into raw bytes.
 * Throws if the input is invalid.
 */
function parseSecretKey(input: string): Uint8Array {
  const trimmed = input.trim();

  if (trimmed.startsWith("nsec1")) {
    const decoded = decode(trimmed);
    if (decoded.type !== "nsec") {
      throw new Error("Invalid nsec");
    }
    return decoded.data;
  }

  // Hex format: 64 hex chars = 32 bytes
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return hexToBytes(trimmed);
  }

  throw new Error("Invalid key format");
}

/**
 * Sign a NIP-42 challenge event using a raw private key.
 * Returns the signed event ready to send to the server.
 */
export function signChallengeWithNsec(
  secretKeyInput: string,
  challenge: string
): NsecLoginResult {
  const secretKey = parseSecretKey(secretKeyInput);
  const pubkey = getPublicKey(secretKey);

  const eventTemplate = {
    kind: 22242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: challenge,
  };

  const signedEvent = finalizeEvent(eventTemplate, secretKey);

  return {
    signedEvent: {
      id: signedEvent.id,
      pubkey,
      created_at: signedEvent.created_at,
      kind: signedEvent.kind,
      tags: signedEvent.tags,
      content: signedEvent.content,
      sig: signedEvent.sig,
    },
  };
}
