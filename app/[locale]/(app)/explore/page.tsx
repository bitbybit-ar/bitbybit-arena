"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { ExploreFilters } from "@/components/challenges/ExploreFilters";
import { ChallengeGrid } from "@/components/challenges/ChallengeGrid";
import type { ChallengeItem } from "@/lib/types";
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
      }
    } catch {
      // silently fail
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [buildParams]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/challenges?${buildParams(nextCursor)}`);
      const json = await res.json();
      if (json.success) {
        setChallenges((prev) => [...prev, ...json.data.items]);
        setNextCursor(json.data.nextCursor ?? null);
      }
    } catch {
      // silently fail; user can scroll again to retry
    } finally {
      setLoadingMore(false);
    }
  }, [buildParams, nextCursor, loadingMore]);

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
      />
    </div>
  );
}
