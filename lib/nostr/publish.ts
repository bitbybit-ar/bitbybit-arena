import type { UnsignedNostrEvent, NostrEvent } from "./types";
import { DEFAULT_RELAYS } from "./relays";

/**
 * Sign an event using NIP-07 browser extension and publish to relays.
 * Returns the signed event or null if signing was rejected.
 */
export async function signAndPublish(
  unsignedEvent: UnsignedNostrEvent,
  relayUrls?: string[]
): Promise<NostrEvent | null> {
  if (!window.nostr) {
    throw new Error("No Nostr extension found");
  }

  let signedEvent: NostrEvent;
  try {
    signedEvent = await window.nostr.signEvent(unsignedEvent);
  } catch {
    return null; // User rejected signing
  }

  const urls = relayUrls ?? DEFAULT_RELAYS;
  await publishToRelays(signedEvent, urls);

  return signedEvent;
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
