"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PixelIcon } from "@/components/common/PixelIcon";
import { BlockLoader } from "@/components/ui/block-loader";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Tag } from "@/components/ui/tag";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { useRouter } from "@/i18n/routing";
import { useSignerContext } from "@/lib/signer-context";
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
  creator: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export default function ExplorePage() {
  const t = useTranslations("explore");
  const tCommon = useTranslations("common");
  const tCreate = useTranslations("createChallenge");
  const { session, needsSigner, requestReSignIn } = useSignerContext();
  const router = useRouter();

  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [sort, setSort] = useState("newest");
  const [popularTags, setPopularTags] = useState<{ tag: string; count: number }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (types.length > 0) params.set("type", types.join(","));
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    params.set("sort", sort);
    params.set("status", "open");

    try {
      const res = await fetch(`/api/challenges?${params}`);
      const json = await res.json();
      if (json.success) {
        setChallenges(json.data.items);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [search, types, sort, selectedTags]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

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

  const typeOptions = ["one_time", "streak", "competition", "race", "creative"];

  const typeDropdownOptions = typeOptions.map((opt) => ({
    value: opt,
    label: tCreate(`types.${opt}`),
  }));

  const sortDropdownOptions = [
    { value: "newest", label: t("newest") },
    { value: "ending_soon", label: t("endingSoon") },
    { value: "most_participants", label: t("mostParticipants") },
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
            {search || types.length > 0 || selectedTags.length > 0
              ? t("emptyFiltered")
              : t("empty")}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {challenges.map((challenge) => (
            <Link
              key={challenge.id}
              href={`/explore/${challenge.id}`}
              className={styles.card}
            >
              <div className={styles.cardHeader}>
                <Tag variant={typeVariant(challenge.type)}>
                  {tCreate(`types.${challenge.type}`)}
                </Tag>
              </div>
              <h3 className={styles.cardTitle}>{challenge.title}</h3>
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
              <div className={styles.cardCreator}>
                {challenge.creator.display_name}
              </div>
            </Link>
          ))}
        </div>
      )}

    </div>
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
