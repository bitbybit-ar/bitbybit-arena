"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { ExploreFilters } from "@/components/challenges/ExploreFilters";
import { ChallengeGrid } from "@/components/challenges/ChallengeGrid";
import type { ChallengeItem } from "@/lib/types";
import type { ZapGoalProgressData } from "@/app/api/challenges/[id]/zap-goal-progress/route";
import { useRouter } from "@/i18n/routing";
import { useSignerContext } from "@/lib/signer-context";
import { useFollowList } from "@/lib/hooks/useFollowList";
import styles from "./explore.module.scss";

const PAGE_LIMIT = 20;

export default function ExplorePage() {
  const t = useTranslations("explore");
  const tCommon = useTranslations("common");
  const { session, needsSigner, requestReSignIn } = useSignerContext();
  const router = useRouter();

  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [sort, setSort] = useState("newest");
  const [popularTags, setPopularTags] = useState<{ tag: string; count: number }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [source, setSource] = useState<"everyone" | "following">("everyone");
  // Parent-fetched zap-goal progress keyed by challenge id. Populated
  // in one /api/challenges/zap-goal-progress POST per page instead of
  // 20 /api/challenges/[id]/zap-goal-progress GETs from the cards.
  // Threaded down through <ChallengeGrid> into <ChallengeCard>'s
  // optional `zapGoalData` prop, which short-circuits the card's
  // per-mount fetch when a value is present.
  const [zapGoalDataMap, setZapGoalDataMap] = useState<
    Record<string, ZapGoalProgressData | null>
  >({});

  // Tracks the request id for the most recent first-page fetch so an
  // older request that resolves late (slow relay, slow DB) can't clobber
  // a newer one — otherwise toggling filters in quick succession leaves
  // the list out of sync with the controls.
  const requestIdRef = useRef(0);

  const { pubkeys: followPubkeys } = useFollowList(session?.nostr_pubkey ?? null);
  const followBoostActive = followPubkeys.length > 0;

  const buildParams = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (types.length > 0) params.set("type", types.join(","));
      if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
      params.set("sort", sort);
      params.set("status", "open");
      params.set("limit", String(PAGE_LIMIT));
      if (cursor) params.set("cursor", cursor);
      if (followBoostActive) {
        params.set("follow_pubkeys", followPubkeys.join(","));
      }
      if (source === "following" && followBoostActive) {
        params.set("only_following", "true");
      }
      return params;
    },
    [search, types, selectedTags, sort, followPubkeys, followBoostActive, source]
  );

  /**
   * Fire one POST /api/challenges/zap-goal-progress for the subset of
   * `items` that advertise a `zap_goal_event_id`, then merge the
   * response into `zapGoalDataMap`. `requestId` matches the filter
   * generation that kicked off this fetch — if the user flipped
   * filters mid-flight the stale batch is dropped on the floor so it
   * can't clobber the new map. Errors stay silent: cards fall back to
   * their self-fetch / no-bar rendering just like today when the
   * per-card fetch errors.
   *
   * This is hydration data — not blocking — so the caller doesn't
   * await it. Cards render immediately with their goal bar in the
   * loading skeleton state and swap to real numbers when this
   * resolves.
   */
  const fetchZapGoalProgressBatch = useCallback(
    (items: ChallengeItem[], requestId: number) => {
      const ids = items
        .filter((c) => !!c.zap_goal_event_id)
        .map((c) => c.id);
      if (ids.length === 0) return;
      // Seed the map with `null` placeholders so the cards see a
      // defined-but-empty entry and skip their own self-fetch while
      // the batch is in flight. ChallengeCard treats `null` as
      // "parent owns this, render skeleton until real data lands".
      setZapGoalDataMap((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          if (!(id in next)) next[id] = null;
        }
        return next;
      });
      void fetch("/api/challenges/zap-goal-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (requestIdRef.current !== requestId) return;
          if (!json?.success || !json.data) return;
          const incoming = json.data as Record<
            string,
            ZapGoalProgressData | null
          >;
          setZapGoalDataMap((prev) => ({ ...prev, ...incoming }));
        })
        .catch(() => {
          /* ignore — cards keep their null placeholder and render the
             loading-skeleton variant of the zap bar, same as today
             when the per-card fetch errors. */
        });
    },
    []
  );

  const fetchPage = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/challenges?${buildParams(null)}`);
      const json = await res.json();
      if (requestIdRef.current !== requestId) return;
      if (json.success) {
        setChallenges(json.data.items);
        setNextCursor(json.data.nextCursor ?? null);
        // Reset the map on a fresh page — the previous filter may have
        // surfaced a different slice of challenges and we don't want
        // stale entries leaking into the new grid.
        setZapGoalDataMap({});
        fetchZapGoalProgressBatch(json.data.items, requestId);
      }
    } catch {
      // silently fail
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [buildParams, fetchZapGoalProgressBatch]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const requestId = requestIdRef.current;
    try {
      const res = await fetch(`/api/challenges?${buildParams(nextCursor)}`);
      const json = await res.json();
      if (json.success) {
        const newItems = json.data.items as ChallengeItem[];
        setChallenges((prev) => [...prev, ...newItems]);
        setNextCursor(json.data.nextCursor ?? null);
        // Only fetch progress for ids we don't already have — cached
        // entries from the first page (or earlier load-mores) stay put.
        setZapGoalDataMap((prev) => {
          const missing = newItems.filter(
            (c) => c.zap_goal_event_id && !(c.id in prev)
          );
          if (missing.length > 0) {
            fetchZapGoalProgressBatch(missing, requestId);
          }
          return prev;
        });
      }
    } catch {
      // silently fail; user can scroll again to retry
    } finally {
      setLoadingMore(false);
    }
  }, [buildParams, nextCursor, loadingMore, fetchZapGoalProgressBatch]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tags/popular?limit=20")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) {
          setPopularTags(json.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag]
    );
  };

  const clearTags = () => setSelectedTags([]);

  const handleCreateClick = async () => {
    // Anonymous or reattach users: prompt to sign in first so we don't
    // land on /explore/create without a usable signer.
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    router.push("/create");
  };

  const filtersActive =
    !!search ||
    types.length > 0 ||
    selectedTags.length > 0 ||
    source === "following";
  const emptyMessage = filtersActive ? t("emptyFiltered") : t("empty");

  return (
    <div className={styles.page}>
      <AppPageHeader
        title={t("title")}
        actions={
          <>
            {session && (
              <Button href="/my-challenges" variant="success" size="sm">
                {tCommon("myChallenges")}
              </Button>
            )}
            <Button onClick={handleCreateClick} size="sm">
              {t("createNew")}
            </Button>
          </>
        }
      />

      <ExploreFilters
        search={search}
        onSearchChange={setSearch}
        types={types}
        onTypesChange={setTypes}
        sort={sort}
        onSortChange={setSort}
        source={source}
        onSourceChange={setSource}
        popularTags={popularTags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onClearTags={clearTags}
        showSource={!!session}
        followBoostActive={followBoostActive}
      />

      <ChallengeGrid
        challenges={challenges}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={nextCursor !== null}
        onLoadMore={loadMore}
        emptyMessage={emptyMessage}
        zapGoalDataMap={zapGoalDataMap}
      />
    </div>
  );
}
