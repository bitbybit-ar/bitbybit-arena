"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNostrMetadata } from "@/lib/nostr/metadata";
import type { NostrMetadata } from "@/lib/nostr/types";

export interface ZapperProfile {
  display_name?: string;
  picture?: string;
}

/**
 * Progressively fetch kind:0 metadata for a list of zapper pubkeys.
 *
 * The hook keeps a per-instance cache keyed by pubkey so the same
 * profile isn't requested twice across re-renders as the live zap
 * subscription appends new zappers. Callers get a `Map<pubkey,
 * ZapperProfile>` back — pubkeys that are still loading or failed to
 * resolve simply don't appear in the map, and the consumer falls
 * back to whatever placeholder it had before (e.g. a dicebear avatar
 * + truncated pubkey).
 *
 * Intentionally best-effort and non-blocking: the progress panel
 * renders with placeholders immediately and upgrades in place as
 * each kind:0 lookup resolves.
 */
export function useZapperMetadata(pubkeys: string[]): Map<string, ZapperProfile> {
  const [profiles, setProfiles] = useState<Map<string, ZapperProfile>>(
    () => new Map()
  );

  // Track which pubkeys we've already kicked off a fetch for. We
  // never retry a failed lookup within the hook's lifetime — the
  // cost of a missing avatar for a flaky relay is far lower than a
  // retry loop hammering relays every re-render.
  const fetchedRef = useRef<Set<string>>(new Set());

  const upsert = useCallback((pubkey: string, profile: ZapperProfile) => {
    setProfiles((prev) => {
      if (prev.get(pubkey) === profile) return prev;
      const next = new Map(prev);
      next.set(pubkey, profile);
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Dedupe within this effect pass too — `pubkeys` may repeat the
    // same zapper across multiple recent zaps.
    const newKeys = Array.from(new Set(pubkeys)).filter(
      (pk) => !fetchedRef.current.has(pk)
    );
    if (newKeys.length === 0) return;

    let cancelled = false;
    for (const pk of newKeys) {
      fetchedRef.current.add(pk);
      void fetchNostrMetadata(pk)
        .then((meta: NostrMetadata | null) => {
          if (cancelled || !meta) return;
          const profile: ZapperProfile = {};
          if (typeof meta.display_name === "string" && meta.display_name) {
            profile.display_name = meta.display_name;
          } else if (typeof meta.name === "string" && meta.name) {
            profile.display_name = meta.name;
          }
          if (typeof meta.picture === "string" && meta.picture) {
            profile.picture = meta.picture;
          }
          if (profile.display_name || profile.picture) {
            upsert(pk, profile);
          }
        })
        .catch(() => {
          /* swallow — placeholder stays */
        });
    }

    return () => {
      cancelled = true;
    };
  }, [pubkeys, upsert]);

  return profiles;
}
