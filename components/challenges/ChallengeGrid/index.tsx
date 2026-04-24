"use client";

import { useTranslations } from "next-intl";
import { BlockLoader } from "@/components/ui/block-loader";
import { PixelIcon } from "@/components/common/PixelIcon";
import { EmptyState } from "@/components/common/EmptyState";
import { InfiniteScrollSentinel } from "@/components/common/InfiniteScrollSentinel";
import {
  ChallengeCard,
  type ChallengeItem,
} from "@/components/challenges/ChallengeCard";
import type { ZapGoalProgressData } from "@/app/api/challenges/[id]/zap-goal-progress/route";
import styles from "./challenge-grid.module.scss";

interface ChallengeGridProps {
  challenges: ChallengeItem[];
  loading: boolean;
  loadingMore: boolean;
  /** True when the server reported another page (nextCursor != null). */
  hasMore: boolean;
  onLoadMore: () => void;
  /** Optional message override for the empty state. Parent passes the
   *  "filtered" variant when any filter is active, otherwise the
   *  default "no challenges yet" copy. */
  emptyMessage?: string;
  /** Optional per-card zap-goal progress the parent has pre-fetched.
   *  When absent, cards lazy-fetch individually (default behavior). */
  zapGoalDataMap?: Record<string, ZapGoalProgressData | null>;
}

export function ChallengeGrid({
  challenges,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  emptyMessage,
  zapGoalDataMap,
}: ChallengeGridProps) {
  const tCommon = useTranslations("common");
  const tExplore = useTranslations("explore");

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <BlockLoader label={tCommon("loading")} />
      </div>
    );
  }

  if (challenges.length === 0) {
    return (
      <EmptyState
        icon={<PixelIcon shape="flag" blockSize={8} />}
        title={emptyMessage ?? tExplore("empty")}
      />
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {challenges.map((challenge) => (
          <ChallengeCard
            key={challenge.id}
            challenge={challenge}
            zapGoalData={zapGoalDataMap?.[challenge.id]}
          />
        ))}
      </div>
      <div className={styles.scrollSentinel} aria-hidden="true">
        {loadingMore && <BlockLoader label={tCommon("loading")} />}
      </div>
      <InfiniteScrollSentinel
        onVisible={onLoadMore}
        disabled={!hasMore || loadingMore}
        rootMargin="400px"
      />
    </>
  );
}
