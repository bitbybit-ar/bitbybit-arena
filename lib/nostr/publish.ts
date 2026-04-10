import type { NostrEvent } from "./types";
import { DEFAULT_RELAYS } from "./relays";

/**
 * Publish an already-signed Nostr event to relays.
 *
 * Signing is deferred to the SignerProvider so callers can use any signer
 * type (NIP-07 extension, in-memory nsec, NIP-46 bunker) without caring
 * which one is active.
 */
export async function publishSignedEvent(
  signedEvent: NostrEvent,
  relayUrls?: string[]
): Promise<void> {
  const urls = relayUrls ?? DEFAULT_RELAYS;
  await publishToRelays(signedEvent, urls);
}

/**
 * Publish a signed event to multiple relays.
 * Fire-and-forget — doesn't wait for all relays to confirm.
 */
async function publishToRelays(event: NostrEvent, relayUrls: string[]): Promise<void> {
  const message = JSON.stringify(["EVENT", event]);

  const promises = relayUrls.map((url) =>
    new Promise<void>((resolve) => {
      try {
        const ws = new WebSocket(url);
        const timeout = setTimeout(() => {
          try { ws.close(); } catch { /* ignore */ }
          resolve();
        }, 5000);

        ws.addEventListener("open", () => {
          ws.send(message);
          // Wait briefly for OK response, then close
          setTimeout(() => {
            clearTimeout(timeout);
            try { ws.close(); } catch { /* ignore */ }
            resolve();
          }, 1000);
        });

        ws.addEventListener("error", () => {
          clearTimeout(timeout);
          resolve();
        });
      } catch {
        resolve();
      }
    })
  );

  // Wait for at least one relay, don't block on all
  await Promise.race([
    Promise.all(promises),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
}

/**
 * Build a NIP-57 zap URL for a recipient.
 * Opens the user's Lightning wallet to zap.
 */
export function getZapUrl(lightningAddress: string, amount: number, comment?: string): string {
  // Lightning address format: user@domain → https://domain/.well-known/lnurlp/user
  const [user, domain] = lightningAddress.split("@");
  if (!user || !domain) return "";

  const params = new URLSearchParams();
  params.set("amount", String(amount * 1000)); // millisats
  if (comment) params.set("comment", comment);

  return `https://${domain}/.well-known/lnurlp/${user}?${params}`;
}
