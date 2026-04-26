"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Block } from "@/components/common/Block";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
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
  /** When true, the row is the user's currently-selected checkpoint; the
   *  formSlot is rendered inline. When false, an actionable checkpoint
   *  row collapses to a CTA so only one form is open at a time. */
  selected?: boolean;
  /** Set when the row should behave as a button — joined participant +
   *  the checkpoint is actionable (todo or rejected). */
  onSelect?: () => void;
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
  selected = false,
  onSelect,
}: CheckpointItemProps) {
  const t = useTranslations("challenge");
  const tCommon = useTranslations("common");
  const interactive = !!onSelect;

  const header = (
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
          width={320}
          height={320}
          loading="lazy"
          decoding="async"
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
      {interactive && !selected && (
        <p className={styles.selectHint}>{t("checkpointSelectToSubmit")}</p>
      )}
    </div>
  );

  return (
    <div className={cn(styles.itemWrap, selected && styles.itemWrapSelected)}>
      {interactive ? (
        // Form is rendered as a sibling below — the <button> can't wrap
        // inputs/textareas/file pickers without producing invalid HTML
        // (interactive descendants of a button).
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={cn(styles.item, styles.itemButton, selected && styles.itemSelected)}
        >
          <Block size="small" color={BLOCK_COLOR[status]} />
          {header}
        </button>
      ) : (
        <div className={styles.item}>
          <Block size="small" color={BLOCK_COLOR[status]} />
          {header}
        </div>
      )}
      {selected && formSlot && (
        <div className={styles.formPanel}>{formSlot}</div>
      )}
    </div>
  );
}
