import { DEFAULT_RELAYS } from "./relays";
import type { NostrEvent } from "./types";
import { verifyNostrEvent } from "./verify";

export interface RelayFilter {
  kinds?: number[];
  authors?: string[];
  ids?: string[];
  since?: number;
  until?: number;
  limit?: number;
  [tag: `#${string}`]: string[] | undefined;
}

export interface FetchFirstMatchingOptions {
  relays?: string[];
  timeoutMs?: number;
}

/**
 * Server-side: open a REQ subscription against each relay in parallel,
 * resolve with the first event that matches the filter AND passes
 * signature verification. Resolves null on timeout or when all sockets
 * close without a match.
 *
 * Mirrors the WebSocket pattern used in `server-metadata.ts`.
 */
export async function fetchFirstMatchingEvent(
  filter: RelayFilter,
  options: FetchFirstMatchingOptions = {}
): Promise<NostrEvent | null> {
  const urls = options.relays ?? DEFAULT_RELAYS;
  const timeoutMs = options.timeoutMs ?? 8000;

  if (urls.length === 0) return null;

  return new Promise<NostrEvent | null>((resolve) => {
    let resolved = false;
    const sockets: WebSocket[] = [];

    const finish = (result: NostrEvent | null) => {
      if (resolved) return;
      resolved = true;
      for (const s of sockets) {
        try {
          s.close();
        } catch {
          /* ignore */
        }
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    let closedCount = 0;
    const checkAllDone = () => {
      closedCount += 1;
      if (closedCount >= urls.length && !resolved) {
        clearTimeout(timer);
        finish(null);
      }
    };

    for (const url of urls) {
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        const subId = `srv_${Math.random().toString(36).slice(2, 8)}`;

        ws.addEventListener("open", () => {
          ws.send(JSON.stringify(["REQ", subId, filter]));
        });

        ws.addEventListener("message", (event) => {
          if (resolved) return;
          try {
            const data = JSON.parse(String(event.data)) as unknown[];
            if (data[0] === "EVENT" && data[2]) {
              const candidate = data[2] as NostrEvent;
              if (verifyNostrEvent(candidate)) {
                clearTimeout(timer);
                finish(candidate);
                return;
              }
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
