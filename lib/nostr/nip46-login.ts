/**
 * NIP-46 (Nostr Connect) login utilities.
 * Supports two flows:
 * 1. QR scan: app generates a nostrconnect:// URI, user scans with signer app
 * 2. Bunker paste: user pastes a bunker:// URL from their signer app
 *
 * Both establish an encrypted relay channel. The remote signer signs the
 * challenge event without exposing the private key.
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { bytesToHex } from "nostr-tools/utils";
import {
  BunkerSigner,
  parseBunkerInput,
  createNostrConnectURI,
} from "nostr-tools/nip46";
import { DEFAULT_RELAYS } from "./relays";

const NIP46_TIMEOUT_MS = 120_000; // 2 minutes
const NIP46_RELAYS = DEFAULT_RELAYS.slice(0, 2); // Use first 2 relays for NIP-46

interface NostrConnectSession {
  uri: string;
  clientSecretKey: Uint8Array;
}

/**
 * Generate a nostrconnect:// URI for QR code display.
 * Returns the URI and the client secret key needed to complete the connection.
 */
export function createConnectSession(): NostrConnectSession {
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  const secret = bytesToHex(generateSecretKey()).slice(0, 16);

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: NIP46_RELAYS,
    secret,
    name: "BitByBit Arena",
    url: process.env.NEXT_PUBLIC_BASE_URL || "https://arena.bitbybit.com.ar",
  });

  return { uri, clientSecretKey };
}

/**
 * Wait for a remote signer to connect via the nostrconnect:// URI.
 * Resolves when the signer approves, rejects on timeout or abort.
 */
export async function waitForConnection(
  session: NostrConnectSession,
  abortSignal?: AbortSignal
): Promise<BunkerSigner> {
  return BunkerSigner.fromURI(
    session.clientSecretKey,
    session.uri,
    {},
    abortSignal ?? NIP46_TIMEOUT_MS
  );
}

/**
 * Connect via a bunker:// URL pasted by the user.
 */
export async function connectWithBunkerURL(
  bunkerInput: string
): Promise<BunkerSigner> {
  const bp = await parseBunkerInput(bunkerInput.trim());
  if (!bp) {
    throw new Error("Invalid bunker URL");
  }

  const clientSecretKey = generateSecretKey();
  const signer = BunkerSigner.fromBunker(clientSecretKey, bp);
  await signer.connect();
  return signer;
}

/**
 * Sign a NIP-42 challenge event using a BunkerSigner.
 * Returns the signed event ready to send to the server.
 */
export async function signChallengeWithBunker(
  signer: BunkerSigner,
  challenge: string
): Promise<{
  signedEvent: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  };
}> {
  const pubkey = await signer.getPublicKey();

  const eventTemplate = {
    kind: 22242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: challenge,
  };

  const signedEvent = await signer.signEvent(eventTemplate);

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
