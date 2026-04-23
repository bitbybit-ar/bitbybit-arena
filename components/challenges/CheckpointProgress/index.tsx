"use client";

import { useTranslations } from "next-intl";
import styles from "./checkpoint-progress.module.scss";

interface CheckpointProgressProps {
  approved: number;
  pending: number;
  total: number;
  /**
   * `full` = dots + "X/Y checkpoints · N in review" (used on my-challenges
   * cards). `compact` = just "X/Y" (used next to the section title on the
   * challenge detail page, where dots would double up with the Block
   * icons on each row).
   */
  variant?: "full" | "compact";
}

/**
 * Shared checkpoint-progress indicator. The dots double as a visual
 * summary for readers who scan the card without reading the label, and
 * the per-status split (approved / pending / todo) matches the Block
 * colors on the challenge detail page so the two surfaces stay
 * visually consistent.
 */
export function CheckpointProgress({
  approved,
  pending,
  total,
  variant = "full",
}: CheckpointProgressProps) {
  const t = useTranslations("myChallenges");

  if (variant === "compact") {
    return (
      <span className={styles.compact}>
        {t("checkpointProgress", { approved, total })}
      </span>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div
        className={styles.dots}
        aria-label={t("checkpointProgressLabel", { approved, total })}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={
              i < approved
                ? styles.dotDone
                : i < approved + pending
                  ? styles.dotPending
                  : styles.dotTodo
            }
            aria-hidden="true"
          />
        ))}
      </div>
      <span className={styles.text}>
        {t("checkpointProgress", { approved, total })}
        {pending > 0 && (
          <>
            {" "}
            <span className={styles.pending}>
              · {t("checkpointPending", { count: pending })}
            </span>
          </>
        )}
      </span>
    </div>
  );
}
