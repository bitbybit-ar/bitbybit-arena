"use client";

import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import styles from "./explore-filters.module.scss";

interface ExploreFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  types: string[];
  onTypesChange: (v: string[]) => void;
  sort: string;
  onSortChange: (v: string) => void;
  source: "everyone" | "following";
  onSourceChange: (v: "everyone" | "following") => void;
  popularTags: { tag: string; count: number }[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  /** Parent passes `!!session` so the follow-source dropdown hides
   *  when logged out (see #77). */
  showSource: boolean;
  followBoostActive: boolean;
}

const TYPE_OPTIONS = ["one_time", "streak", "competition", "race", "creative"];

export function ExploreFilters({
  search,
  onSearchChange,
  types,
  onTypesChange,
  sort,
  onSortChange,
  source,
  onSourceChange,
  popularTags,
  selectedTags,
  onToggleTag,
  onClearTags,
  showSource,
  followBoostActive,
}: ExploreFiltersProps) {
  const t = useTranslations("explore");
  const tCreate = useTranslations("createChallenge");

  const typeDropdownOptions = TYPE_OPTIONS.map((opt) => ({
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

  const sourceDropdownOptions = [
    { value: "everyone", label: t("sourceEveryone") },
    { value: "following", label: t("sourceFollowing") },
  ];

  return (
    <>
      <div className={styles.controls}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <div className={styles.filters}>
          {showSource && (
            <Dropdown
              options={sourceDropdownOptions}
              value={source}
              onChange={(value) =>
                onSourceChange(value as "everyone" | "following")
              }
              aria-label={t("source")}
              disabled={!followBoostActive}
              className={styles.filterDropdown}
            />
          )}
          <Dropdown
            multiple
            options={typeDropdownOptions}
            value={types}
            onChange={onTypesChange}
            aria-label={t("filterByType")}
            placeholder={t("allTypes")}
            allLabel={t("allTypes")}
            summaryFormatter={(count) => t("typesSelected", { count })}
            className={styles.filterDropdown}
          />
          <Dropdown
            options={sortDropdownOptions}
            value={sort}
            onChange={onSortChange}
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
              const color = tagColor(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={cn(
                    styles.tagChip,
                    styles[`tagChip-${color}`],
                    isActive && styles.tagChipActive
                  )}
                  aria-pressed={isActive}
                  aria-label={t("toggleTagFilter", { tag })}
                  onClick={() => onToggleTag(tag)}
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
                onClick={() => onToggleTag(tag)}
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
              onClick={onClearTags}
            >
              {t("clearTagFilters")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Stable hash so the same tag always renders with the same palette
// color (no jitter across re-renders). Four-color cycle maps to the
// four brand tokens: purple / gold / red / green.
const TAG_COLOR_CYCLE = ["purple", "gold", "red", "green"] as const;
type TagColor = (typeof TAG_COLOR_CYCLE)[number];

function tagColor(tag: string): TagColor {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % TAG_COLOR_CYCLE.length;
  return TAG_COLOR_CYCLE[idx];
}
