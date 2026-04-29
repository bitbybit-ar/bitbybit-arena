"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_RELAYS } from "@/lib/nostr/relays";
import { verifyNostrEvent } from "@/lib/nostr/verify";
import type { NostrEvent } from "@/lib/nostr/types";
import styles from "./profile.module.scss";

interface ProfileBadgesGridProps {
  pubkey: string;
}

interface ResolvedBadge {
  /** kind:8 award event id — used as the React key. */
  awardId: string;
  /** kind:30009 `d`-tag of the badge definition. */
  badgeId: string;
  /** Name from the badge definition; falls back to the d-tag. */
  name: string;
  /** Description from the definition (optional, may be empty). */
  description: string | null;
  /** `image` tag from the definition; null when missing. */
  imageUrl: string | null;
  /** Issuer pubkey (from the kind:8 author). */
  issuer: string;
}

// Render every NIP-58 badge currently associated with `pubkey`,
// regardless of which app issued it. Two-stage relay query:
//
//   1. Subscribe to kind:8 awards p-tagging this pubkey across the
//      default relays. Each award carries an `a` tag pointing at the
//      `30009:<issuer>:<d>` definition and an `e` tag for the award
//      itself.
//
//   2. For every distinct definition coordinate referenced, subscribe
//      to that kind:30009 (parameterized replaceable) so we can render
//      its `image`, `name`, `description`. Definitions are
//      deduplicated by coordinate to avoid re-fetching the same one.
//
// Both stages run through the same WebSocket pool and collect events
// into the local state. Empty grid renders a friendly empty-state.
export function ProfileBadgesGrid({ pubkey }: ProfileBadgesGridProps) {
  const t = useTranslations("profile");
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<ResolvedBadge[]>([]);

  useEffect(() => {
    let cancelled = false;
    const sockets: WebSocket[] = [];
    // Award events keyed by their id so duplicates from different
    // relays collapse into one entry.
    const awardsById = new Map<string, NostrEvent>();
    // Definitions keyed by their coordinate `30009:<pk>:<d>`.
    const defsByCoord = new Map<string, NostrEvent>();
    // Track which coords we've already issued a kind:30009 REQ for so
    // we don't re-fetch the same definition every time another award
    // referencing it arrives. Late awards (slow relays, post-EOSE
    // streaming on replaceable events) can still trigger a one-time
    // lookup for a coord we haven't seen before — that's the case the
    // single-shot `definitionsRequested` flag missed previously.
    const requestedCoords = new Set<string>();

    const flush = () => {
      if (cancelled) return;
      const resolved: ResolvedBadge[] = [];
      for (const award of awardsById.values()) {
        const aTag = award.tags.find(
          (tag) => tag[0] === "a" && tag[1]?.startsWith("30009:")
        );
        if (!aTag) continue;
        const coord = aTag[1];
        const def = defsByCoord.get(coord);
        // Without the definition we don't have an image to show. Skip
        // this award until the definition arrives — it'll re-flush.
        if (!def) continue;
        const dTag = coord.split(":")[2] ?? "";
        const nameTag = def.tags.find((tag) => tag[0] === "name")?.[1];
        const descTag = def.tags.find((tag) => tag[0] === "description")?.[1];
        const imageTag = def.tags.find((tag) => tag[0] === "image")?.[1];
        resolved.push({
          awardId: award.id,
          badgeId: dTag,
          name: nameTag ?? dTag,
          description: descTag ?? null,
          imageUrl: imageTag ?? null,
          issuer: award.pubkey,
        });
      }
      // Most-recent first — `created_at` reflects when the issuer
      // signed the award, which is the closest signal we have to
      // "when was this earned" without per-recipient timestamps.
      resolved.sort((a, b) => {
        const aw = awardsById.get(a.awardId);
        const bw = awardsById.get(b.awardId);
        return (bw?.created_at ?? 0) - (aw?.created_at ?? 0);
      });
      setBadges(resolved);
    };

    // Send REQs for any kind:30009 definitions referenced by awards
    // we've collected but not yet looked up. Idempotent — already-
    // requested coords are skipped, so this can be called from the
    // awards EOSE AND from each new kind:8 that arrives, without
    // duplicating relay traffic.
    const requestPendingDefinitions = () => {
      const wanted = new Map<string, { issuer: string; dTag: string }>();
      for (const award of awardsById.values()) {
        const aTag = award.tags.find(
          (tag) => tag[0] === "a" && tag[1]?.startsWith("30009:")
        );
        if (!aTag) continue;
        if (requestedCoords.has(aTag[1])) continue;
        const [, issuer, dTag] = aTag[1].split(":");
        if (!issuer || !dTag) continue;
        wanted.set(aTag[1], { issuer, dTag });
      }
      if (wanted.size === 0) return;

      // Group by issuer so we can issue one filter per author rather
      // than N filters with a single-element authors array each.
      const byIssuer = new Map<string, string[]>();
      for (const { issuer, dTag } of wanted.values()) {
        const list = byIssuer.get(issuer) ?? [];
        list.push(dTag);
        byIssuer.set(issuer, list);
      }
      for (const coord of wanted.keys()) requestedCoords.add(coord);
      for (const ws of sockets) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        for (const [issuer, dTags] of byIssuer.entries()) {
          ws.send(
            JSON.stringify([
              "REQ",
              `def_${issuer.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`,
              {
                kinds: [30009],
                authors: [issuer],
                "#d": dTags,
              },
            ])
          );
        }
      }
    };

    let openCount = 0;
    let definitionEoseCount = 0;
    const totalRelays = DEFAULT_RELAYS.length;

    for (const url of DEFAULT_RELAYS) {
      try {
        const ws = new WebSocket(url);
        sockets.push(ws);
        const awardSubId = `aw_${Math.random().toString(36).slice(2, 8)}`;

        ws.addEventListener("open", () => {
          openCount += 1;
          ws.send(
            JSON.stringify([
              "REQ",
              awardSubId,
              { kinds: [8], "#p": [pubkey], limit: 200 },
            ])
          );
        });

        ws.addEventListener("message", (ev) => {
          if (cancelled) return;
          try {
            const data = JSON.parse(String(ev.data)) as unknown[];
            if (data[0] === "EVENT" && data[2]) {
              const candidate = data[2] as NostrEvent;
              if (!verifyNostrEvent(candidate)) return;
              if (candidate.kind === 8) {
                if (!awardsById.has(candidate.id)) {
                  awardsById.set(candidate.id, candidate);
                  // Late awards (relay returning post-EOSE, or a
                  // slow relay still streaming) can reference a
                  // definition coord we haven't queried yet — so
                  // ask now. The helper de-dupes so we don't spam
                  // the relays with the same REQ twice.
                  requestPendingDefinitions();
                  flush();
                }
                return;
              }
              if (candidate.kind === 30009) {
                const dTag = candidate.tags.find((t) => t[0] === "d")?.[1];
                if (!dTag) return;
                const coord = `30009:${candidate.pubkey}:${dTag}`;
                const existing = defsByCoord.get(coord);
                // Per NIP-01, only the latest by created_at wins for a
                // parameterized replaceable. Keep the freshest copy.
                if (!existing || existing.created_at < candidate.created_at) {
                  defsByCoord.set(coord, candidate);
                  flush();
                }
                return;
              }
            }
            if (data[0] === "EOSE" && typeof data[1] === "string") {
              const subId = data[1];
              if (subId === awardSubId) {
                // Awards subscription on this relay finished its
                // backfill — kick off any pending definition lookups
                // for coords we haven't queried yet. Other relays may
                // still be streaming awards, so don't end the spinner
                // here.
                requestPendingDefinitions();
                // If the awards stream produced no kind:8 events at
                // all (and every relay agrees), we have nothing to
                // resolve and can drop the spinner.
                if (awardsById.size === 0) {
                  setLoading(false);
                }
              } else if (subId.startsWith("def_")) {
                definitionEoseCount += 1;
                // Stop the spinner once every relay has answered the
                // definition lookup, even if the grid is empty.
                if (definitionEoseCount >= totalRelays) {
                  setLoading(false);
                }
              }
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
        ws.addEventListener("close", () => {
          if (cancelled) return;
          // Last fallback: if every relay closed without sending us
          // anything, drop the spinner. The definition-EOSE branch
          // above already handles the success path; this just covers
          // a network where every relay rejects the connection.
          if (openCount === 0 && definitionEoseCount === 0) {
            setLoading(false);
          }
        });
      } catch {
        /* skip this relay */
      }
    }

    // Hard cap: even if relays never EOSE, drop the spinner after 10s.
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 10_000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const ws of sockets) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [pubkey]);

  if (loading && badges.length === 0) {
    return <p className={styles.loading}>{t("badgesLoading")}</p>;
  }

  if (!loading && badges.length === 0) {
    return <p className={styles.empty}>{t("badgesEmpty")}</p>;
  }

  return (
    <div className={styles.badgesGrid}>
      {badges.map((badge) => (
        <div key={badge.awardId} className={styles.badgeCard}>
          {badge.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={badge.imageUrl}
              alt={badge.name}
              className={styles.badgeImage}
              width={192}
              height={192}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className={styles.badgeImagePlaceholder} aria-hidden="true" />
          )}
          <p className={styles.badgeName}>{badge.name}</p>
          {badge.description && (
            <p className={styles.badgeDescription}>{badge.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
