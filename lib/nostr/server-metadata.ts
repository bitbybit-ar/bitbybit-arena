import { DEFAULT_RELAYS } from "./relays";
import type { NostrMetadata } from "./types";

/**
 * Server-side: Fetch the latest kind 0 (metadata) event for a pubkey from relays.
 * Uses native WebSocket (available in Node.js 21+ and Next.js edge runtime).
 */
export async function fetchNostrMetadataServer(
  pubkey: string,
  relayUrls?: string[],
  timeoutMs = 8000
): Promise<NostrMetadata | null> {
  const urls = relayUrls ?? DEFAULT_RELAYS;

  return new Promise((resolve) => {
    let bestCreatedAt = 0;
    let bestContent: string | null = null;
    let resolved = false;
    const sockets: WebSocket[] = [];

    const finish = () => {
      if (resolved) return;
      resolved = true;
      for (const s of sockets) {
        try { s.close(); } catch { /* ignore */ }
      }
      if (bestContent) {
        try {
          resolve(JSON.parse(bestContent) as NostrMetadata);
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    };

    const timer = setTimeout(finish, timeoutMs);

    let closedCount = 0;
    const checkAllDone = () => {
      closedCount++;
      if (closedCount >= urls.length) {
        clearTimeout(timer);
        finish();
      }
    };

    for (const url of urls) {
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        const subId = `srv_${Math.random().toString(36).slice(2, 8)}`;

        ws.addEventListener("open", () => {
          ws.send(JSON.stringify([
            "REQ",
            subId,
            { kinds: [0], authors: [pubkey], limit: 1 },
          ]));
        });

        ws.addEventListener("message", (event) => {
          try {
            const data = JSON.parse(String(event.data));
            if (data[0] === "EVENT" && data[2]) {
              const nostrEvent = data[2];
              if (nostrEvent.created_at > bestCreatedAt) {
                bestCreatedAt = nostrEvent.created_at;
                bestContent = nostrEvent.content;
              }
            }
            if (data[0] === "EOSE") {
              ws.close();
            }
          } catch { /* ignore parse errors */ }
        });

        ws.addEventListener("error", () => { try { ws.close(); } catch { /* ignore */ } });
        ws.addEventListener("close", checkAllDone);
      } catch {
        closedCount++;
      }
    }

    if (urls.length === 0) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}
