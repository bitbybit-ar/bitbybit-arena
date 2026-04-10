/**
 * Client-side "create new identity" helper.
 * Generates a fresh Nostr keypair, signs the NIP-42 challenge, and returns
 * everything the caller needs to register the signer in memory + display
 * the nsec to the user. The secret key never touches the network or storage.
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nsecEncode } from "nostr-tools/nip19";
import { signChallengeWithNsec } from "./nsec-login";
import { bytesToHex } from "nostr-tools/utils";

export interface CreatedIdentity {
  secretKey: Uint8Array;
  pubkey: string;
  nsec: string;
  signedEvent: ReturnType<typeof signChallengeWithNsec>["signedEvent"];
}

/**
 * Generate a new Nostr identity and sign the given NIP-42 challenge with it.
 * The caller is responsible for posting `signedEvent` to /api/auth/nostr and
 * for handing `secretKey`/`pubkey` to the SignerProvider so the user can sign
 * subsequent events without re-entering the key.
 */
export function createNewIdentity(challenge: string): CreatedIdentity {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const nsec = nsecEncode(secretKey);

  // Reuse the existing nsec signer; pass hex form to avoid double-decoding.
  const { signedEvent } = signChallengeWithNsec(bytesToHex(secretKey), challenge);

  return { secretKey, pubkey, nsec, signedEvent };
}
