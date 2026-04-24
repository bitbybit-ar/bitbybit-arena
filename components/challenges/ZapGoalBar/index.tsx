"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { BoltIcon } from "@/components/icons";
import styles from "./zap-goal-bar.module.scss";

interface ZapGoalBarProps {
  raisedSats: number;
  goalSats: number;
  zapperCount: number;
  compact?: boolean;
  /**
   * Renders a shimmering zero-filled placeholder in place of the real
   * bar + label. Used by the Explore card while the server-side
   * progress snapshot is still loading so the card's layout doesn't
   * shift when the real numbers arrive a beat later.
   */
  loading?: boolean;
}

/**
 * Compact one-line progress indicator for challenge cards in Explore.
 *
 * Intentionally minimal — cards are dense, so this renders a thin
 * gold-ceramic bar over the card's existing ceramic surface plus a
 * single-line "X / Y sats" label. Interactive follow-ups (Fund this
 * pot) happen on the detail page, not from the card.
 */
export function ZapGoalBar({
  raisedSats,
  goalSats,
  zapperCount,
  compact = false,
  loading = false,
}: ZapGoalBarProps) {
  const t = useTranslations("zapGoal");
  if (goalSats <= 0) return null;

  if (loading) {
    return (
      <div
        className={`${styles.wrapper} ${compact ? styles.compact : ""} ${styles.loading}`}
        aria-busy="true"
      >
        <div className={styles.track}>
          <div className={styles.skeleton} />
        </div>
        <div className={styles.label}>
          <span className={styles.skeletonText} aria-hidden="true" />
        </div>
      </div>
    );
  }

  const percent = Math.min(100, Math.round((raisedSats / goalSats) * 100));

  return (
    <div className={`${styles.wrapper} ${compact ? styles.compact : ""}`}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goalSats}
        aria-valuenow={raisedSats}
        aria-label={t("ariaProgress", {
          raised: raisedSats,
          goal: goalSats,
        })}
      >
        <div
          className={styles.fill}
          style={{ "--fill-width": `${percent}%` } as CSSProperties}
        />
      </div>
      <div className={styles.label}>
        <span className={styles.raised}>
          <BoltIcon size={12} color="var(--color-secondary)" />
          {raisedSats.toLocaleString()}
        </span>
        <span className={styles.goal}>
          {t("ofGoal", { goal: goalSats.toLocaleString() })}
        </span>
        {zapperCount > 0 && (
          <span className={styles.zappers}>
            {t("zappers", { count: zapperCount })}
          </span>
        )}
      </div>
    </div>
  );
}
