import { DEFAULT_RELAYS } from "./relays";
import type { NostrEvent } from "./types";

export interface ParsedZapReceipt {
  /** Kind 9735 event id. Used for dedupe. */
  receipt_id: string;
  /** Zapper's pubkey — author of the embedded kind 9734 request. */
  zapper_pubkey: string;
  /** Amount in sats, parsed from the embedded kind 9734 amount tag. */
  amount_sats: number;
  /** Optional message from the zap request content. Empty string if none. */
  message: string;
  /** Receipt created_at (unix seconds). */
  received_at: number;
}

export interface FetchZapReceiptsOptions {
  relays?: string[];
  timeoutMs?: number;
  /** Hard cap on events collected. Defaults to 500. */
  limit?: number;
}

/**
 * Collect every kind 9735 zap receipt from relays that references
 * `goalEventId` via an `e` tag, parse the embedded kind 9734 request
 * out of each receipt's `description` tag, and return a deduped list
 * sorted newest-first.
 *
 * Isomorphic: uses the runtime `WebSocket` global, which is available
 * in modern browsers and Node 20+. Server routes and client hooks can
 * both call this.
 *
 * We do NOT verify signatures here — goal-progress is a read-only,
 * visual-only feature, and the recipient's node (not the zapper) is
 * the party with skin in the game for receipt authenticity. If we ever
 * display zap receipts as attribution for on-chain state (e.g. "goal
 * funded → enable payout"), add `verifyNostrEvent` at that point.
 */
export async function fetchZapReceipts(
  goalEventId: string,
  options: FetchZapReceiptsOptions = {}
): Promise<ParsedZapReceipt[]> {
  const urls = options.relays ?? DEFAULT_RELAYS;
  const timeoutMs = options.timeoutMs ?? 6000;
  const limit = options.limit ?? 500;

  if (urls.length === 0 || !goalEventId) return [];

  const events = await collectEvents(goalEventId, urls, timeoutMs, limit);
  const seen = new Set<string>();
  const parsed: ParsedZapReceipt[] = [];

  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    const p = parseZapReceipt(ev);
    if (p) parsed.push(p);
  }

  parsed.sort((a, b) => b.received_at - a.received_at);
  return parsed;
}

/**
 * Parse a single kind 9735 receipt into `ParsedZapReceipt`.
 * Returns null when the receipt lacks a valid embedded kind 9734 or
 * doesn't carry a numeric `amount` tag. Exported for unit tests.
 */
export function parseZapReceipt(receipt: NostrEvent): ParsedZapReceipt | null {
  if (receipt.kind !== 9735) return null;

  const descTag = receipt.tags.find((t) => t[0] === "description");
  if (!descTag || !descTag[1]) return null;

  let zapRequest: NostrEvent | null = null;
  try {
    zapRequest = JSON.parse(descTag[1]) as NostrEvent;
  } catch {
    return null;
  }
  if (!zapRequest || zapRequest.kind !== 9734) return null;
  if (typeof zapRequest.pubkey !== "string") return null;

  const amountTag = zapRequest.tags.find((t) => t[0] === "amount");
  if (!amountTag || !amountTag[1]) return null;
  const msats = Number(amountTag[1]);
  if (!Number.isFinite(msats) || msats <= 0) return null;

  return {
    receipt_id: receipt.id,
    zapper_pubkey: zapRequest.pubkey,
    amount_sats: Math.floor(msats / 1000),
    message: typeof zapRequest.content === "string" ? zapRequest.content : "",
    received_at: receipt.created_at,
  };
}

/**
 * Open a REQ for kind:9735 `#e=goalEventId` on every relay in parallel,
 * collect events until EOSE from all relays (or timeout), return the
 * accumulated list. No signature verification — see `fetchZapReceipts`.
 */
function collectEvents(
  goalEventId: string,
  urls: string[],
  timeoutMs: number,
  limit: number
): Promise<NostrEvent[]> {
  return new Promise<NostrEvent[]>((resolve) => {
    const bucket: NostrEvent[] = [];
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
      resolve(bucket);
    };

    const timer = setTimeout(finish, timeoutMs);

    let closedCount = 0;
    const checkAllDone = () => {
      closedCount += 1;
      if (closedCount >= urls.length && !resolved) {
        clearTimeout(timer);
        finish();
      }
    };

    for (const url of urls) {
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        const subId = `zg_${Math.random().toString(36).slice(2, 8)}`;

        const filter = {
          kinds: [9735],
          "#e": [goalEventId],
          limit,
        };

        ws.addEventListener("open", () => {
          ws.send(JSON.stringify(["REQ", subId, filter]));
        });

        ws.addEventListener("message", (msg) => {
          if (resolved) return;
          try {
            const data = JSON.parse(String(msg.data)) as unknown[];
            if (data[0] === "EVENT" && data[2]) {
              bucket.push(data[2] as NostrEvent);
              if (bucket.length >= limit) {
                clearTimeout(timer);
                finish();
              }
              return;
            }
            if (data[0] === "EOSE") {
              ws.close();
            }
          } catch {
            /* ignore parse errors */
          }
        });

        ws.addEventListener("error", () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        });
        ws.addEventListener("close", checkAllDone);
      } catch {
        closedCount += 1;
      }
    }
  });
}
