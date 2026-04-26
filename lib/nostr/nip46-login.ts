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
import { bytesToHex, hexToBytes } from "nostr-tools/utils";
import {
  BunkerSigner,
  parseBunkerInput,
  createNostrConnectURI,
} from "nostr-tools/nip46";

const NIP46_TIMEOUT_MS = 60_000;

export type BunkerLoginErrorCode = "bunker_invalid_url";

// Throws a stable, locale-neutral `code` so callers can translate to
// the active locale instead of leaking English to the user.
export class BunkerLoginError extends Error {
  constructor(public readonly code: BunkerLoginErrorCode) {
    super(code);
    this.name = "BunkerLoginError";
  }
}

/**
 * Relays used for the NIP-46 rendezvous channel.
 * `relay.nsec.app` MUST come first: nsec.app and most bunker apps listen
 * on it by default, and if the app-side URI doesn't advertise it, they
 * never see the connect request.
 */
const NIP46_CONNECT_RELAYS = [
  "wss://relay.nsec.app",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
];

const LOCAL_CLIENT_KEY_STORAGE = "arena-nip46-client-key";

/**
 * Get (or lazily create) the persistent client secret key used to pair
 * with a remote signer. Reusing the same key across connect attempts
 * lets a signer app recognise us on retry and avoids a fresh handshake
 * every time the panel re-mounts.
 */
function getLocalClientSecret(): Uint8Array {
  if (typeof localStorage === "undefined") return generateSecretKey();

  try {
    const saved = localStorage.getItem(LOCAL_CLIENT_KEY_STORAGE);
    if (saved && /^[0-9a-f]{64}$/i.test(saved)) {
      return hexToBytes(saved);
    }
  } catch {
    /* storage unavailable — fall through to a fresh key */
  }

  const key = generateSecretKey();
  try {
    localStorage.setItem(LOCAL_CLIENT_KEY_STORAGE, bytesToHex(key));
  } catch {
    /* ignore */
  }
  return key;
}

export interface BunkerLoginOptions {
  /**
   * Called when the remote signer returns an approval URL (e.g. Amber,
   * nsec.app when auth_url is required). The UI should render a
   * button/link that opens this URL so the user can complete approval.
   */
  onAuthUrl?: (url: string) => void;
}

interface NostrConnectSession {
  uri: string;
  clientSecretKey: Uint8Array;
}

/**
 * Generate a nostrconnect:// URI for QR code display.
 * Returns the URI and the client secret key needed to complete the connection.
 */
export function createConnectSession(): NostrConnectSession {
  const clientSecretKey = getLocalClientSecret();
  const clientPubkey = getPublicKey(clientSecretKey);
  const secret = bytesToHex(generateSecretKey()).slice(0, 16);

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: NIP46_CONNECT_RELAYS,
    secret,
    name: "BitByBit Arena",
    url:
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_BASE_URL || "https://arena.bitbybit.com.ar",
  });

  return { uri, clientSecretKey };
}

/**
 * Wait for a remote signer to connect via the nostrconnect:// URI.
 * Resolves when the signer approves, rejects on timeout or abort.
 */
export async function waitForConnection(
  session: NostrConnectSession,
  options: BunkerLoginOptions & { abortSignal?: AbortSignal } = {}
): Promise<BunkerSigner> {
  const { abortSignal, onAuthUrl } = options;

  // `BunkerSigner.fromURI`'s 4th arg accepts either a number (timeout ms)
  // or an AbortSignal — not both. We want both, so we wire the abort
  // signal through a Promise.race against our own timeout.
  const fromUriPromise = BunkerSigner.fromURI(
    session.clientSecretKey,
    session.uri,
    {
      onauth: onAuthUrl,
    },
    NIP46_TIMEOUT_MS
  );

  if (!abortSignal) return fromUriPromise;

  return new Promise<BunkerSigner>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    if (abortSignal.aborted) {
      onAbort();
      return;
    }
    abortSignal.addEventListener("abort", onAbort, { once: true });
    fromUriPromise
      .then((signer) => {
        abortSignal.removeEventListener("abort", onAbort);
        resolve(signer);
      })
      .catch((err) => {
        abortSignal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

/**
 * Connect via a bunker:// URL pasted by the user.
 */
export async function connectWithBunkerURL(
  bunkerInput: string,
  options: BunkerLoginOptions = {}
): Promise<BunkerSigner> {
  const bp = await parseBunkerInput(bunkerInput.trim());
  if (!bp) {
    throw new BunkerLoginError("bunker_invalid_url");
  }

  const clientSecretKey = getLocalClientSecret();
  const signer = BunkerSigner.fromBunker(clientSecretKey, bp, {
    onauth: options.onAuthUrl,
  });

  // Prime the connection and cache the user pubkey. Calling connect and
  // getPublicKey here means any auth-url prompt fires now, not mid-finalize.
  await signer.connect();
  await signer.getPublicKey();
  return signer;
}
