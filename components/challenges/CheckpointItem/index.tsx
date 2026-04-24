"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Block } from "@/components/common/Block";
import { Tag } from "@/components/ui/tag";
import styles from "./checkpoint-item.module.scss";

export type CheckpointItemStatus =
  | "done"
  | "awaiting-review"
  | "rejected"
  | "locked"
  | "todo";

interface CheckpointItemProps {
  /** 1-based position shown to the reader. */
  index: number;
  title: string;
  description: string | null;
  status: CheckpointItemStatus;
  /** The participant's submission text — shown only on awaiting-review. */
  submittedContent?: string | null;
  /** The submitted photo — shown on awaiting-review (and later, on done). */
  submittedImageUrl?: string | null;
  /** Creator's reason for rejection — rendered on the rejected state. */
  rejectReason?: string | null;
  /**
   * Slot for the per-checkpoint submission form. Caller decides when
   * to render it (e.g. only when isParticipant && !done && !awaiting-
   * review && !locked) — this component doesn't gate on that.
   */
  formSlot?: ReactNode;
}

const BLOCK_COLOR: Record<CheckpointItemStatus, "green" | "gold" | "red" | "purple"> = {
  done: "green",
  "awaiting-review": "gold",
  rejected: "red",
  locked: "red",
  todo: "purple",
};

export function CheckpointItem({
  index,
  title,
  description,
  status,
  submittedContent,
  submittedImageUrl,
  rejectReason,
  formSlot,
}: CheckpointItemProps) {
  const t = useTranslations("challenge");
  const tCommon = useTranslations("common");

  return (
    <div className={styles.item}>
      <Block size="small" color={BLOCK_COLOR[status]} />
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.order}>{index}.</span>
          <strong>{title}</strong>
          {status === "done" && (
            <Tag variant="green">{tCommon("completed")}</Tag>
          )}
          {status === "awaiting-review" && (
            <Tag variant="gold">{t("checkpointAwaitingReview")}</Tag>
          )}
          {status === "rejected" && (
            <Tag variant="red">{tCommon("rejected")}</Tag>
          )}
        </div>
        {description && <p className={styles.description}>{description}</p>}
        {status === "awaiting-review" && submittedContent && (
          <p className={styles.submittedContent}>{submittedContent}</p>
        )}
        {status === "awaiting-review" && submittedImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={submittedImageUrl}
            alt={t("checkpointProofImageAlt", { index })}
            className={styles.submittedImage}
          />
        )}
        {status === "awaiting-review" && (
          <p className={styles.hint}>{t("checkpointPendingReviewHint")}</p>
        )}
        {status === "rejected" && rejectReason && (
          <p className={styles.rejectReason}>
            <strong>{t("checkpointRejectReasonLabel")}:</strong> {rejectReason}
          </p>
        )}
        {status === "rejected" && (
          <p className={styles.hint}>{t("checkpointResubmitHint")}</p>
        )}
        {status === "locked" && (
          <p className={styles.hint}>{t("checkpointLocked")}</p>
        )}
        {formSlot}
      </div>
    </div>
  );
}
