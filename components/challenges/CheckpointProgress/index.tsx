"use client";

import { useTranslations } from "next-intl";
import styles from "./checkpoint-progress.module.scss";

/**
 * Discriminated on `variant`. The compact variant only needs the
 * approved/total split (dots would double up with the Block icons on
 * each row of the detail page), so `pending` doesn't appear there.
 */
type CheckpointProgressProps =
  | {
      variant: "compact";
      approved: number;
      total: number;
    }
  | {
      variant?: "full";
      approved: number;
      pending: number;
      total: number;
    };

/**
 * Shared checkpoint-progress indicator. The dot colors (approved =
 * green, pending = gold, todo = muted) mirror the Block colors on the
 * challenge detail page so the two surfaces stay visually consistent.
 */
export function CheckpointProgress(props: CheckpointProgressProps) {
  const t = useTranslations("challenge");

  if (props.variant === "compact") {
    return (
      <span className={styles.compact}>
        {t("checkpointProgress", {
          approved: props.approved,
          total: props.total,
        })}
      </span>
    );
  }

  const { approved, pending, total } = props;
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
              · {t("checkpointPendingCount", { count: pending })}
            </span>
          </>
        )}
      </span>
    </div>
  );
}
