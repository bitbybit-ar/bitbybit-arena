"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Tag } from "@/components/ui/tag";
import { BoltIcon } from "@/components/icons";
import { ZapGoalBar } from "@/components/challenges/ZapGoalBar";
import type { ZapGoalProgressData } from "@/app/api/challenges/[id]/zap-goal-progress/route";
import styles from "./challenge-card.module.scss";

export interface ChallengeItem {
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

interface ChallengeCardProps {
  challenge: ChallengeItem;
  /** Optional pre-fetched zap-goal progress. When omitted the card
   *  lazy-fetches its own progress on mount (default behavior). */
  zapGoalData?: ZapGoalProgressData | null;
}

export function ChallengeCard({ challenge, zapGoalData }: ChallengeCardProps) {
  const tCreate = useTranslations("createChallenge");
  const tCommon = useTranslations("common");
  const tExplore = useTranslations("explore");

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
              preloaded={zapGoalData}
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
  /** When provided (or explicitly `null`) the card skips the lazy
   *  fetch and renders the parent-supplied progress directly. */
  preloaded?: ZapGoalProgressData | null;
}

/**
 * Lazy-fetches the NIP-75 funding progress for a single Explore card.
 * Each mount hits `/api/challenges/[id]/zap-goal-progress`, which is
 * TTL-cached server-side, so the relay work is amortized across the
 * whole viewer base. Renders a zero-filled skeleton bar while the
 * request is in flight so the card's layout doesn't shift when the
 * real numbers arrive. Errors stay silent — the card still shows the
 * prize amount in the reward row, the bar is optional polish.
 */
function CardZapGoalBar({ challengeId, goalSats, preloaded }: CardZapGoalBarProps) {
  const [progress, setProgress] = useState<ZapGoalProgressData | null>(
    preloaded ?? null
  );

  useEffect(() => {
    // Parent already supplied the progress — skip the fetch entirely.
    if (preloaded !== undefined) {
      setProgress(preloaded);
      return;
    }
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
  }, [challengeId, preloaded]);

  if (!progress) {
    return (
      <ZapGoalBar
        raisedSats={0}
        goalSats={goalSats}
        zapperCount={0}
        compact
        loading
      />
    );
  }

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
