"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchZapReceipts,
  parseZapReceipt,
  type ParsedZapReceipt,
} from "@/lib/nostr/fetch-zap-receipts";
import { DEFAULT_RELAYS } from "@/lib/nostr/relays";
import type { NostrEvent } from "@/lib/nostr/types";
import type {
  ZapGoalProgressData,
  ZapGoalProgressZapper,
} from "@/app/api/challenges/[id]/zap-goal-progress/route";

const RECENT_ZAPPERS = 8;

interface UseZapGoalProgressOptions {
  /**
   * Initial snapshot from the server endpoint — avoids an empty-state
   * flash before the first client-side fetch resolves.
   */
  initial?: ZapGoalProgressData | null;
  /** Skip relay work entirely — useful when the challenge has no prize. */
  enabled?: boolean;
}

interface UseZapGoalProgressResult {
  raisedSats: number;
  goalSats: number;
  zapperCount: number;
  recentZappers: ZapGoalProgressZapper[];
  loading: boolean;
  error: Error | null;
  /** Force a full re-fetch (e.g. after the viewer sends their own zap). */
  refresh: () => Promise<void>;
}

/**
 * Track a NIP-75 zap goal's funding progress in real time.
 *
 * Flow:
 *   1. Seed state from the optional `initial` snapshot.
 *   2. On mount, re-fetch from relays via `fetchZapReceipts` to reconcile
 *      any updates the server's cached snapshot may have missed.
 *   3. Open a long-lived WebSocket subscription per relay for `kind:9735
 *      #e=goalEventId` with no `limit`. Each incoming receipt updates the
 *      running totals; duplicates across relays are deduped by receipt id.
 *
 * Best-effort and read-only: signatures aren't verified (see the note on
 * `fetchZapReceipts`). If a relay goes down mid-subscription we lose live
 * updates from that relay but the initial fetch already captured any
 * pre-existing zaps.
 */
export function useZapGoalProgress(
  goalEventId: string | null,
  targetSats: number,
  options: UseZapGoalProgressOptions = {}
): UseZapGoalProgressResult {
  const { initial, enabled = true } = options;

  const [raisedSats, setRaisedSats] = useState(initial?.raised_sats ?? 0);
  const [zapperCount, setZapperCount] = useState(initial?.zapper_count ?? 0);
  const [recentZappers, setRecentZappers] = useState<ZapGoalProgressZapper[]>(
    initial?.recent_zappers ?? []
  );
  const [loading, setLoading] = useState(enabled && !!goalEventId);
  const [error, setError] = useState<Error | null>(null);

  // Master list of every unique receipt we've seen so far in this session.
  // Totals are derived from this list so `refresh()` and live updates
  // both converge on the same shape. Using a ref keeps the WebSocket
  // `onmessage` handler from closing over stale state.
  const receiptsRef = useRef<ParsedZapReceipt[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const recomputeFromReceipts = useCallback(() => {
    const all = receiptsRef.current;
    const total = all.reduce((sum, r) => sum + r.amount_sats, 0);
    const zappers = new Set(all.map((r) => r.zapper_pubkey));
    const sorted = [...all].sort((a, b) => b.received_at - a.received_at);
    setRaisedSats(total);
    setZapperCount(zappers.size);
    setRecentZappers(
      sorted.slice(0, RECENT_ZAPPERS).map((r) => ({
        pubkey: r.zapper_pubkey,
        amount_sats: r.amount_sats,
        message: r.message,
        received_at: r.received_at,
      }))
    );
  }, []);

  const ingestReceipts = useCallback(
    (incoming: ParsedZapReceipt[]) => {
      let changed = false;
      for (const r of incoming) {
        if (seenIdsRef.current.has(r.receipt_id)) continue;
        seenIdsRef.current.add(r.receipt_id);
        receiptsRef.current.push(r);
        changed = true;
      }
      if (changed) recomputeFromReceipts();
    },
    [recomputeFromReceipts]
  );

  const refresh = useCallback(async () => {
    if (!goalEventId || !enabled) return;
    try {
      const receipts = await fetchZapReceipts(goalEventId);
      ingestReceipts(receipts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("zap_goal_fetch_failed"));
    } finally {
      setLoading(false);
    }
  }, [goalEventId, enabled, ingestReceipts]);

  // One-shot seeding from the initial server snapshot. We can't ingest
  // the server's parsed zappers into `receiptsRef` because the server
  // projection drops the receipt id (we only kept the projected shape
  // in the cache), so we let the client-side relay fetch rebuild the
  // canonical dedup set. The initial snapshot still feeds state above
  // so the first paint shows non-zero totals.
  useEffect(() => {
    if (!goalEventId || !enabled) return;
    void refresh();
  }, [goalEventId, enabled, refresh]);

  // Live subscription: open one socket per relay, keep it open for the
  // hook's lifetime, feed every new `kind:9735 #e=goalEventId` into
  // `ingestReceipts`. We accept duplicate events across relays because
  // the seenIds set drops them cheaply.
  useEffect(() => {
    if (!goalEventId || !enabled) return;
    if (typeof window === "undefined") return;

    const sockets: WebSocket[] = [];
    let cancelled = false;

    for (const url of DEFAULT_RELAYS) {
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        const subId = `zg_live_${Math.random().toString(36).slice(2, 8)}`;

        ws.addEventListener("open", () => {
          if (cancelled) return;
          ws.send(
            JSON.stringify([
              "REQ",
              subId,
              {
                kinds: [9735],
                "#e": [goalEventId],
                // No `since` — the relay will replay prior events until
                // EOSE and then stream new ones. Dedup takes care of
                // overlap with the initial `refresh()` call.
              },
            ])
          );
        });

        ws.addEventListener("message", (msg) => {
          if (cancelled) return;
          try {
            const data = JSON.parse(String(msg.data)) as unknown[];
            if (data[0] === "EVENT" && data[2]) {
              const parsed = parseZapReceipt(data[2] as NostrEvent);
              if (parsed) ingestReceipts([parsed]);
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
        /* relay refused to connect — other relays still work */
      }
    }

    return () => {
      cancelled = true;
      for (const s of sockets) {
        try {
          s.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [goalEventId, enabled, ingestReceipts]);

  return {
    raisedSats,
    goalSats: targetSats,
    zapperCount,
    recentZappers,
    loading,
    error,
    refresh,
  };
}
