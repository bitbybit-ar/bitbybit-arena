"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_RELAYS } from "@/lib/nostr/relays";
import type { NostrEvent } from "@/lib/nostr/types";

interface CachedFollowList {
  pubkey: string;
  pubkeys: string[];
  fetched_at: number;
}

const CACHE_KEY = "bbb:nip02:followlist";
// Re-fetch the follow list at most once per hour. Kind:3 doesn't change
// every minute and the WS round-trip to several relays is expensive.
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;
const HEX_64 = /^[0-9a-f]{64}$/;

function readCache(pubkey: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFollowList;
    if (parsed.pubkey !== pubkey) return null;
    if (Date.now() - parsed.fetched_at > CACHE_TTL_MS) return null;
    return parsed.pubkeys;
  } catch {
    return null;
  }
}

function writeCache(pubkey: string, pubkeys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedFollowList = {
      pubkey,
      pubkeys,
      fetched_at: Date.now(),
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or disabled storage — fall back to in-memory state only */
  }
}

function extractPubkeys(event: NostrEvent): string[] {
  const seen = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== "p") continue;
    const candidate = tag[1]?.toLowerCase();
    if (candidate && HEX_64.test(candidate)) seen.add(candidate);
  }
  return Array.from(seen);
}

/**
 * Open a REQ subscription against each relay in parallel and resolve with
 * the most-recent kind:3 event seen across any of them. We can't return
 * the very first one because relays sometimes serve a stale copy first.
 */
async function fetchLatestFollowList(
  pubkey: string,
  relays: string[]
): Promise<NostrEvent | null> {
  if (relays.length === 0) return null;
  return new Promise<NostrEvent | null>((resolve) => {
    let best: NostrEvent | null = null;
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
      resolve(best);
    };

    const timer = setTimeout(finish, FETCH_TIMEOUT_MS);

    let closedCount = 0;
    const checkAllDone = () => {
      closedCount += 1;
      if (closedCount >= relays.length && !resolved) {
        clearTimeout(timer);
        finish();
      }
    };

    for (const url of relays) {
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        const subId = `nip02_${Math.random().toString(36).slice(2, 8)}`;

        ws.addEventListener("open", () => {
          ws.send(
            JSON.stringify([
              "REQ",
              subId,
              { kinds: [3], authors: [pubkey], limit: 1 },
            ])
          );
        });

        ws.addEventListener("message", (event) => {
          if (resolved) return;
          try {
            const data = JSON.parse(String(event.data)) as unknown[];
            if (data[0] === "EVENT" && data[2]) {
              const candidate = data[2] as NostrEvent;
              if (
                candidate.kind === 3 &&
                candidate.pubkey === pubkey &&
                (!best || candidate.created_at > best.created_at)
              ) {
                best = candidate;
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

interface UseFollowListResult {
  pubkeys: string[];
  loading: boolean;
}

/**
 * Resolve the NIP-02 (kind:3) follow list for the given pubkey.
 * Hydrates from localStorage immediately, then refreshes from relays in
 * the background. Returns an empty array when no list is available so
 * callers can safely treat it as "no boost".
 */
export function useFollowList(pubkey: string | null | undefined): UseFollowListResult {
  const [pubkeys, setPubkeys] = useState<string[]>(() =>
    pubkey ? readCache(pubkey) ?? [] : []
  );
  const [loading, setLoading] = useState(false);
  // Tracks the most recent pubkey we kicked a fetch for so a stale
  // response (after sign-out / sign-in as a different identity) doesn't
  // overwrite the new user's follow list with the previous user's.
  const lastPubkeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pubkey) {
      setPubkeys([]);
      return;
    }
    lastPubkeyRef.current = pubkey;
    const cached = readCache(pubkey);
    if (cached) {
      setPubkeys(cached);
      return; // fresh cache hit, skip the network round-trip entirely
    }
    setLoading(true);
    let cancelled = false;
    fetchLatestFollowList(pubkey, DEFAULT_RELAYS)
      .then((event) => {
        if (cancelled || lastPubkeyRef.current !== pubkey) return;
        const list = event ? extractPubkeys(event) : [];
        writeCache(pubkey, list);
        setPubkeys(list);
      })
      .catch(() => {
        /* swallow — empty list just disables the boost */
      })
      .finally(() => {
        if (!cancelled && lastPubkeyRef.current === pubkey) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  return { pubkeys, loading };
}
