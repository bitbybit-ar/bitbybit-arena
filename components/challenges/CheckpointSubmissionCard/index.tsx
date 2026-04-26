"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import type { Checkpoint, PendingCheckpointSubmission } from "@/lib/types";
import styles from "./checkpoint-submission-card.module.scss";

interface CheckpointSubmissionCardProps {
  submission: PendingCheckpointSubmission;
  /** The checkpoint this submission targets, if the caller has it. */
  checkpoint: Checkpoint | null;
  /** 1-based position, null when the checkpoint couldn't be resolved. */
  checkpointOrder: number | null;
  loading: boolean;
  /**
   * Controlled reject-reason textarea value. Parent owns the
   * dictionary keyed by submission id so it can clear on a successful
   * verify without the card re-rendering from stale state.
   */
  rejectReason: string;
  onRejectReasonChange: (next: string) => void;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * One pending checkpoint submission as rendered on the creator's
 * review list. Bundles the participant identity, the submitted proof
 * (text + optional image + optional nostr event link), the approve /
 * reject buttons, and an always-visible optional "reason if rejecting"
 * textarea. Approve ignores the textarea; reject persists whatever's
 * in it.
 */
export function CheckpointSubmissionCard({
  submission,
  checkpoint,
  checkpointOrder,
  loading,
  rejectReason,
  onRejectReasonChange,
  onApprove,
  onReject,
}: CheckpointSubmissionCardProps) {
  const t = useTranslations("challenge");
  const tCommon = useTranslations("common");

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.user}>
          {submission.participant.user.display_name}
        </span>
        <Tag variant="gold">{tCommon("pending")}</Tag>
      </div>
      {checkpoint && (
        <p className={styles.checkpointLabel}>
          {checkpointOrder !== null && (
            <span className={styles.order}>{checkpointOrder}. </span>
          )}
          <strong>{checkpoint.title}</strong>
        </p>
      )}
      {submission.content && (
        <p className={styles.content}>{submission.content}</p>
      )}
      {submission.image_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={submission.image_url}
          alt={submission.content ?? t("proofImageAlt")}
          className={styles.image}
          width={320}
          height={320}
          loading="lazy"
          decoding="async"
        />
      )}
      {submission.proof_event_id && (
        <p className={styles.content}>
          <a
            href={`https://njump.me/${submission.proof_event_id}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t("proofFound")}: {submission.proof_event_id.slice(0, 16)}…
          </a>
        </p>
      )}
      <div className={styles.rejectReasonRow}>
        <label
          htmlFor={`reject-reason-${submission.id}`}
          className={styles.rejectReasonLabel}
        >
          {t("rejectReasonLabel")}
        </label>
        <textarea
          id={`reject-reason-${submission.id}`}
          className={styles.rejectReasonInput}
          placeholder={t("rejectReasonPlaceholder")}
          value={rejectReason}
          onChange={(e) => onRejectReasonChange(e.target.value)}
          rows={2}
          maxLength={500}
        />
      </div>
      <div className={styles.actions}>
        <Button size="sm" onClick={onApprove} disabled={loading}>
          {loading ? t("approving") : tCommon("approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onReject}
          disabled={loading}
        >
          {tCommon("reject")}
        </Button>
      </div>
    </div>
  );
}
