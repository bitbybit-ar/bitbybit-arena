"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PixelIcon } from "@/components/common/PixelIcon";
import { BlockLoader } from "@/components/ui/block-loader";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Tag } from "@/components/ui/tag";
import { BoltIcon } from "@/components/icons";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { ZapGoalBar } from "@/components/challenges/ZapGoalBar";
import type { ZapGoalProgress } from "@/app/api/challenges/[id]/zap-goal-progress/route";
import { useRouter } from "@/i18n/routing";
import { useSignerContext } from "@/lib/signer-context";
import { useFollowList } from "@/lib/hooks/useFollowList";
import { cn } from "@/lib/utils";
import styles from "./explore.module.scss";

interface ChallengeItem {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  tags: string[];
  participant_count: number;
  ends_at: string | null;
  created_at: string;
  prize_amount_sats: number;
  zap_goal_event_id: string | null;
  badge_name: string | null;
  badge_image_url: string | null;
  creator: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

const PAGE_LIMIT = 20;

export default function ExplorePage() {
  const t = useTranslations("explore");
  const tCommon = useTranslations("common");
  const tCreate = useTranslations("createChallenge");
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
  const [onlyFollowing, setOnlyFollowing] = useState(false);

  // Tracks the request id for the most recent first-page fetch so an
  // older request that resolves late (slow relay, slow DB) can't clobber
  // a newer one — otherwise toggling filters in quick succession leaves
  // the list out of sync with the controls.
  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
      if (onlyFollowing && followBoostActive) {
        params.set("only_following", "true");
      }
      return params;
    },
    [search, types, selectedTags, sort, followPubkeys, followBoostActive, onlyFollowing]
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

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

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

  const typeOptions = ["one_time", "streak", "competition", "race", "creative"];

  const typeDropdownOptions = typeOptions.map((opt) => ({
    value: opt,
    label: tCreate(`types.${opt}`),
  }));

  const sortDropdownOptions = [
    { value: "newest", label: t("newest") },
    { value: "trending", label: t("trending") },
    { value: "ending_soon", label: t("endingSoon") },
    { value: "most_participants", label: t("mostParticipants") },
    { value: "most_active", label: t("mostActive") },
  ];

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

      <div className={styles.controls}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.filters}>
          <Dropdown
            multiple
            options={typeDropdownOptions}
            value={types}
            onChange={setTypes}
            aria-label={t("filterByType")}
            placeholder={t("allTypes")}
            allLabel={t("allTypes")}
            summaryFormatter={(count) => t("typesSelected", { count })}
            className={styles.filterDropdown}
          />
          <Dropdown
            options={sortDropdownOptions}
            value={sort}
            onChange={setSort}
            aria-label={t("sortBy")}
            className={styles.filterDropdown}
          />
        </div>
      </div>

      {followBoostActive && (
        <label className={styles.followToggle}>
          <input
            type="checkbox"
            checked={onlyFollowing}
            onChange={(e) => setOnlyFollowing(e.target.checked)}
          />
          <span>{t("onlyFollowing")}</span>
        </label>
      )}

      {popularTags.length > 0 && (
        <div className={styles.tagSection}>
          <span id="popular-tags-label" className={styles.tagSectionLabel}>
            {t("popularTags")}
          </span>
          <div
            className={styles.tagChips}
            role="group"
            aria-labelledby="popular-tags-label"
          >
            {popularTags.map(({ tag, count }) => {
              const isActive = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={cn(styles.tagChip, isActive && styles.tagChipActive)}
                  aria-pressed={isActive}
                  aria-label={t("toggleTagFilter", { tag })}
                  onClick={() => toggleTag(tag)}
                >
                  <span className={styles.tagChipLabel}>#{tag}</span>
                  <span className={styles.tagChipCount}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedTags.length > 0 && (
        <div className={styles.activeFilters}>
          <span id="active-tag-filters-label" className={styles.tagSectionLabel}>
            {t("activeTagFilters")}
          </span>
          <div
            className={styles.activeFilterPills}
            role="group"
            aria-labelledby="active-tag-filters-label"
          >
            {selectedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={styles.activeFilterPill}
                aria-label={t("removeTagFilter", { tag })}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
                <span aria-hidden="true" className={styles.activeFilterPillX}>
                  ×
                </span>
              </button>
            ))}
            <button
              type="button"
              className={styles.clearFiltersButton}
              onClick={clearTags}
            >
              {t("clearTagFilters")}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>
          <BlockLoader label={tCommon("loading")} />
        </div>
      ) : challenges.length === 0 ? (
        <div className={styles.emptyState}>
          <PixelIcon shape="flag" blockSize={8} />
          <p>
            {search ||
            types.length > 0 ||
            selectedTags.length > 0 ||
            onlyFollowing
              ? t("emptyFiltered")
              : t("empty")}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {challenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                tCreate={tCreate}
                tCommon={tCommon}
                tExplore={t}
              />
            ))}
          </div>
          <div ref={sentinelRef} className={styles.scrollSentinel} aria-hidden="true">
            {loadingMore && <BlockLoader label={tCommon("loading")} />}
          </div>
        </>
      )}

    </div>
  );
}

interface ChallengeCardProps {
  challenge: ChallengeItem;
  tCreate: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  tExplore: ReturnType<typeof useTranslations>;
}

function ChallengeCard({
  challenge,
  tCreate,
  tCommon,
  tExplore,
}: ChallengeCardProps) {
  const hasBadge = !!challenge.badge_image_url || !!challenge.badge_name;
  const hasPrize = challenge.prize_amount_sats > 0;
  const showReward = hasBadge || hasPrize;
  const creatorName =
    challenge.creator.display_name || challenge.creator.username;

  return (
    <Link href={`/explore/${challenge.id}`} className={styles.card}>
      <div className={styles.cardHeader}>
        <Tag variant={typeVariant(challenge.type)}>
          {tCreate(`types.${challenge.type}`)}
        </Tag>
      </div>
      <h3 className={styles.cardTitle}>{challenge.title}</h3>
      <p className={styles.cardCreator}>
        {tExplore("by")} {creatorName}
      </p>
      <p className={styles.cardDescription}>
        {challenge.description.slice(0, 120)}
        {challenge.description.length > 120 ? "..." : ""}
      </p>
      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>
          {challenge.participant_count} {tCommon("participants")}
        </span>
        {challenge.ends_at && (
          <span className={styles.metaItem}>
            {formatDate(challenge.ends_at)}
          </span>
        )}
      </div>
      {showReward && (
        <div className={styles.rewardSection}>
          <span className={styles.rewardLabel}>{tExplore("rewardLabel")}</span>
          <div className={styles.rewardItems}>
            {hasBadge && (
              <div className={styles.rewardBadge}>
                {challenge.badge_image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={challenge.badge_image_url}
                    alt={challenge.badge_name ?? tCommon("badge")}
                    className={styles.rewardBadgeImage}
                  />
                ) : (
                  <div className={styles.rewardBadgePlaceholder} aria-hidden="true" />
                )}
                {challenge.badge_name && (
                  <span className={styles.rewardBadgeName}>
                    {challenge.badge_name}
                  </span>
                )}
              </div>
            )}
            {hasPrize && (
              <span className={styles.rewardPrize}>
                <BoltIcon size={14} />
                {challenge.prize_amount_sats.toLocaleString()}{" "}
                {tCommon("sats")}
              </span>
            )}
          </div>
          {hasPrize && challenge.zap_goal_event_id && (
            <CardZapGoalBar
              challengeId={challenge.id}
              goalSats={challenge.prize_amount_sats}
            />
          )}
        </div>
      )}
    </Link>
  );
}

interface CardZapGoalBarProps {
  challengeId: string;
  goalSats: number;
}

/**
 * Lazy-fetches the NIP-75 funding progress for a single Explore card.
 * Each mount hits `/api/challenges/[id]/zap-goal-progress`, which is
 * TTL-cached server-side, so the relay work is amortized across the
 * whole viewer base. Renders nothing while the request is in flight to
 * avoid a layout flash; errors are silently hidden — the card still
 * shows the prize amount in the reward row, the bar is optional polish.
 */
function CardZapGoalBar({ challengeId, goalSats }: CardZapGoalBarProps) {
  const [progress, setProgress] = useState<ZapGoalProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/challenges/${challengeId}/zap-goal-progress`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success && json.data) setProgress(json.data);
      })
      .catch(() => {
        /* ignore — bar is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  if (!progress) return null;

  return (
    <ZapGoalBar
      raisedSats={progress.raised_sats}
      goalSats={goalSats}
      zapperCount={progress.zapper_count}
      compact
    />
  );
}

function typeVariant(type: string): "purple" | "gold" | "green" | "red" {
  switch (type) {
    case "streak": return "gold";
    case "competition": return "red";
    case "creative": return "green";
    default: return "purple";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
