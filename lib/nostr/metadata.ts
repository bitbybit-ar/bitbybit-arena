"use client";

import type { NostrEvent, NostrMetadata } from "./types";
import { DEFAULT_RELAYS } from "./relays";

async function getRelays(): Promise<string[]> {
  try {
    if (window.nostr?.getRelays) {
      const relayMap = await window.nostr.getRelays();
      const urls = Object.keys(relayMap);
      if (urls.length > 0) return urls;
    }
  } catch { /* fall through */ }
  return DEFAULT_RELAYS;
}

/**
 * Fetch the latest kind 0 (metadata) event for a pubkey from relays.
 * Queries multiple relays in parallel and returns the most recent content.
 */
export async function fetchNostrMetadata(
  pubkey: string,
  relayUrls?: string[],
  timeoutMs = 5000
): Promise<NostrMetadata | null> {
  const urls = relayUrls ?? await getRelays();

  return new Promise((resolve) => {
    let bestEvent: NostrEvent | null = null;
    let resolved = false;
    const sockets: WebSocket[] = [];

    const finish = () => {
      if (resolved) return;
      resolved = true;
      for (const s of sockets) {
        try { s.close(); } catch { /* ignore */ }
      }
      if (bestEvent) {
        try {
          resolve(JSON.parse(bestEvent.content) as NostrMetadata);
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
        const subId = `meta_${Math.random().toString(36).slice(2, 8)}`;

        ws.onopen = () => {
          ws.send(JSON.stringify([
            "REQ",
            subId,
            { kinds: [0], authors: [pubkey], limit: 1 },
          ]));
        };

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data as string);
            if (data[0] === "EVENT" && data[2]) {
              const event = data[2] as NostrEvent;
              if (!bestEvent || event.created_at > bestEvent.created_at) {
                bestEvent = event;
              }
            }
            if (data[0] === "EOSE") {
              ws.close();
            }
          } catch { /* ignore parse errors */ }
        };

        ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
        ws.onclose = checkAllDone;
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
