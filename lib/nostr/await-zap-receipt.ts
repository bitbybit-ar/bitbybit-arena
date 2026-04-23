"use client";

import { DEFAULT_RELAYS } from "./relays";
import type { NostrEvent } from "./types";
import { verifyNostrEvent } from "./verify";

export interface AwaitZapReceiptOptions {
  relays?: string[];
  /** How long to wait for the receipt before giving up. */
  timeoutMs?: number;
  /**
   * Lower bound on `created_at` for candidate receipts. Defaults to
   * 60s before now — wide enough to cover a WebLN pay that took a
   * few seconds, narrow enough that stale receipts for earlier zaps
   * to the same recipient don't match.
   */
  since?: number;
  /**
   * Abort the subscription early. Closes all relay sockets and
   * resolves the promise to `null`. Wire this to component unmount
   * so a subscription that started mid-payout doesn't keep sockets
   * open for the full timeout after the user navigates away.
   */
  signal?: AbortSignal;
}

/**
 * After a WebLN zap settles, watch relays for the matching kind:9735
 * receipt that the recipient's node publishes. Returns the receipt's
 * event id so the payout route can record it on the completion row.
 *
 * Matching: NIP-57 says the receipt embeds the original signed kind
 * 9734 request as a JSON-stringified `description` tag. We subscribe
 * with `kinds:[9735]` + `#p:[recipient_pubkey]`, inspect each
 * incoming receipt, and return the first one whose embedded request
 * id matches `signedZapRequestId`. Filtering by recipient keeps the
 * noise down; filtering by request id eliminates false positives
 * from unrelated zaps that happen to the same recipient in the same
 * window.
 *
 * Best-effort and timeboxed. Resolves to `null` on timeout — the
 * payout already succeeded at this point, the receipt is just
 * bookkeeping. The caller should never block the payout loop on
 * this return value.
 */
export async function awaitZapReceipt(params: {
  recipientPubkey: string;
  signedZapRequestId: string;
  options?: AwaitZapReceiptOptions;
}): Promise<string | null> {
  const { recipientPubkey, signedZapRequestId, options = {} } = params;
  const urls = options.relays ?? DEFAULT_RELAYS;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const since =
    options.since ?? Math.floor(Date.now() / 1000) - 60;
  const signal = options.signal;

  if (urls.length === 0 || typeof window === "undefined") return null;
  if (signal?.aborted) return null;

  return new Promise<string | null>((resolve) => {
    const sockets: WebSocket[] = [];
    let done = false;

    const finish = (result: string | null) => {
      if (done) return;
      done = true;
      for (const s of sockets) {
        try {
          s.close();
        } catch {
          /* ignore */
        }
      }
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = () => finish(null);
    if (signal) signal.addEventListener("abort", onAbort);

    const timer = setTimeout(() => finish(null), timeoutMs);

    for (const url of urls) {
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        const subId = `rcpt_${Math.random().toString(36).slice(2, 8)}`;

        ws.addEventListener("open", () => {
          if (done) return;
          ws.send(
            JSON.stringify([
              "REQ",
              subId,
              {
                kinds: [9735],
                "#p": [recipientPubkey],
                since,
              },
            ])
          );
        });

        ws.addEventListener("message", (msg) => {
          if (done) return;
          try {
            const data = JSON.parse(String(msg.data)) as unknown[];
            if (data[0] !== "EVENT" || !data[2]) return;
            const receipt = data[2] as NostrEvent;
            if (receipt.kind !== 9735) return;
            const desc = receipt.tags.find((t) => t[0] === "description");
            if (!desc || !desc[1]) return;
            try {
              const request = JSON.parse(desc[1]) as { id?: string };
              if (request.id !== signedZapRequestId) return;
              // We only verify once we have a candidate match — a
              // relay delivering lots of unrelated receipts for the
              // same recipient shouldn't pay the Schnorr cost for
              // each one. A receipt with our request's id but an
              // invalid signature is almost certainly a forgery
              // attempt to poison `completions.reward_zap_receipt_id`;
              // refuse it and keep listening for the real one.
              if (!verifyNostrEvent(receipt)) return;
              clearTimeout(timer);
              finish(receipt.id);
            } catch {
              /* malformed description — skip */
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
      } catch {
        /* relay refused — other relays may still match */
      }
    }
  });
}
