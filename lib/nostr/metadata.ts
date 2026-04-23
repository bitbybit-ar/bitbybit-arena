"use client";

import type { NostrEvent, NostrMetadata } from "./types";
import { DEFAULT_RELAYS } from "./relays";

/** Fetch the latest event matching the given kind + author from relays. */
export async function fetchLatestEventOfKind(
  pubkey: string,
  kind: number,
  relayUrls?: string[],
  timeoutMs = 5000
): Promise<NostrEvent | null> {
  const urls = relayUrls ?? (await getRelays());

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
      resolve(bestEvent);
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
        const subId = `evt_${Math.random().toString(36).slice(2, 8)}`;

        ws.onopen = () => {
          ws.send(
            JSON.stringify([
              "REQ",
              subId,
              { kinds: [kind], authors: [pubkey], limit: 1 },
            ])
          );
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
          } catch {
            /* ignore parse errors */
          }
        };

        ws.onerror = () => {
          try { ws.close(); } catch { /* ignore */ }
        };
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
 * Fetch the latest kind 0 (metadata) event for a pubkey from relays and
 * return its parsed content.
 */
export async function fetchNostrMetadata(
  pubkey: string,
  relayUrls?: string[],
  timeoutMs = 5000
): Promise<NostrMetadata | null> {
  const event = await fetchLatestEventOfKind(pubkey, 0, relayUrls, timeoutMs);
  if (!event) return null;
  try {
    return JSON.parse(event.content) as NostrMetadata;
  } catch {
    return null;
  }
}

/**
 * Fetch the latest kind 0 (metadata) event for each pubkey in a single
 * REQ per relay. Returns a map keyed by pubkey — pubkeys that didn't
 * resolve on any relay are simply absent from the map.
 *
 * The one-shot variant above opens one WebSocket per call, so fetching
 * N profiles via `Promise.all` means N × relay count sockets. This
 * helper collapses that to `relay count` sockets total by using the
 * NIP-01 `authors` filter, which every major relay implementation
 * supports. Used by the recent-zappers list in the zap goal panel
 * where the pubkey list can hit ~8 unique zappers plus live updates.
 *
 * Newest-wins per pubkey when multiple relays serve different kind:0
 * events for the same author — mirrors the single-pubkey path.
 */
export async function fetchNostrMetadataBatch(
  pubkeys: string[],
  relayUrls?: string[],
  timeoutMs = 5000
): Promise<Map<string, NostrMetadata>> {
  const result = new Map<string, NostrMetadata>();
  if (pubkeys.length === 0) return result;

  const uniquePubkeys = Array.from(new Set(pubkeys));
  const urls = relayUrls ?? (await getRelays());
  if (urls.length === 0) return result;

  // Track newest created_at seen per pubkey so later relays can't
  // overwrite with a stale event that happened to arrive last.
  const newestAt = new Map<string, number>();

  await new Promise<void>((resolve) => {
    let resolved = false;
    const sockets: WebSocket[] = [];

    const finish = () => {
      if (resolved) return;
      resolved = true;
      for (const s of sockets) {
        try {
          s.close();
        } catch {
          /* ignore */
        }
      }
      resolve();
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
        const subId = `meta_batch_${Math.random().toString(36).slice(2, 8)}`;

        ws.onopen = () => {
          ws.send(
            JSON.stringify([
              "REQ",
              subId,
              { kinds: [0], authors: uniquePubkeys },
            ])
          );
        };

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data as string);
            if (data[0] === "EVENT" && data[2]) {
              const event = data[2] as NostrEvent;
              const prev = newestAt.get(event.pubkey) ?? -1;
              if (event.created_at <= prev) return;
              try {
                const meta = JSON.parse(event.content) as NostrMetadata;
                result.set(event.pubkey, meta);
                newestAt.set(event.pubkey, event.created_at);
              } catch {
                /* unparseable kind:0 content — skip */
              }
            }
            if (data[0] === "EOSE") {
              ws.close();
            }
          } catch {
            /* ignore parse errors */
          }
        };

        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        };
        ws.onclose = checkAllDone;
      } catch {
        closedCount++;
      }
    }
  });

  return result;
}
