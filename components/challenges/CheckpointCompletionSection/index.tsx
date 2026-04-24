"use client";

import { useTranslations } from "next-intl";
import { Section, SectionTitle } from "@/components/common/Section";
import {
  CheckpointItem as CheckpointItemRow,
  type CheckpointItemStatus,
} from "@/components/challenges/CheckpointItem";
import { CheckpointProgress } from "@/components/challenges/CheckpointProgress";
import { CheckpointSubmitForm } from "@/components/challenges/CheckpointSubmitForm";
import type { BlossomDescriptor } from "@/lib/nostr/blossom";
import type {
  CheckpointItem,
  CheckpointCompletionItem,
} from "@/app/[locale]/(app)/explore/[id]/challenge-client";
import styles from "./checkpoint-completion-section.module.scss";

/**
 * Per-checkpoint local state on the challenge-detail page, keyed by
 * checkpoint id. Collapses what used to be three parallel records
 * (checkpointProofs / checkpointImages / checkpointErrors) into a
 * single shape so every read/write updates the same object.
 */
export interface CheckpointDraft {
  /** The text proof typed into the textarea. */
  proof: string;
  /** Blossom upload descriptor for the optional image proof. */
  image: BlossomDescriptor | null;
  /** Per-checkpoint validation or submission error message. */
  error: string | null;
}

export function defaultDraft(): CheckpointDraft {
  return { proof: "", image: null, error: null };
}

interface CheckpointCompletionSectionProps {
  checkpointMode: "none" | "sequential" | "parallel";
  checkpoints: CheckpointItem[];
  myCheckpointCompletions: CheckpointCompletionItem[];
  isParticipant: boolean;
  /** Collapsed per-checkpoint draft state keyed by checkpoint id. */
  drafts: Record<string, CheckpointDraft>;
  onDraftChange: (checkpointId: string, patch: Partial<CheckpointDraft>) => void;
  /** Called when the user hits submit on a given checkpoint. Parent
   *  handles signing + Blossom upload + POST. */
  onSubmitCheckpoint: (checkpoint: CheckpointItem) => void;
  /** Parent's in-flight sentinel; drives each row's disabled state. */
  submittingCheckpointId: string | null;
}

export function CheckpointCompletionSection({
  checkpointMode,
  checkpoints,
  myCheckpointCompletions,
  isParticipant,
  drafts,
  onDraftChange,
  onSubmitCheckpoint,
  submittingCheckpointId,
}: CheckpointCompletionSectionProps) {
  const t = useTranslations("challenge");

  if (checkpointMode === "none" || checkpoints.length === 0) {
    return null;
  }

  const approvedCount = myCheckpointCompletions.filter(
    (c) => c.status === "approved"
  ).length;

  return (
    <Section>
      <div className={styles.checkpointsHeader}>
        <SectionTitle>{t("checkpointsTitle")}</SectionTitle>
        <CheckpointProgress
          variant="compact"
          approved={approvedCount}
          total={checkpoints.length}
        />
      </div>
      <p className={styles.emptyText}>
        {checkpointMode === "sequential"
          ? t("checkpointModeSequential")
          : t("checkpointModeParallel")}
      </p>
      <div className={styles.checkpointTower}>
        {checkpoints.map((cp, idx) => {
          const completion = myCheckpointCompletions.find(
            (c) => c.checkpoint_id === cp.id
          );
          const priorIncomplete =
            checkpointMode === "sequential" &&
            checkpoints
              .slice(0, idx)
              .some(
                (earlier) =>
                  !myCheckpointCompletions.find(
                    (c) =>
                      c.checkpoint_id === earlier.id &&
                      c.status === "approved"
                  )
              );
          // `locked` is only meaningful to someone who has joined —
          // a non-participant can't act on a lock, so we render the
          // row as a neutral todo until they join.
          const status: CheckpointItemStatus =
            completion?.status === "approved"
              ? "done"
              : completion?.status === "pending"
                ? "awaiting-review"
                : completion?.status === "rejected"
                  ? "rejected"
                  : isParticipant && priorIncomplete
                    ? "locked"
                    : "todo";
          const canSubmit =
            isParticipant &&
            status !== "done" &&
            status !== "awaiting-review" &&
            status !== "locked";
          const draft = drafts[cp.id];
          return (
            <CheckpointItemRow
              key={cp.id}
              index={idx + 1}
              title={cp.title}
              description={cp.description}
              status={status}
              submittedContent={completion?.content ?? null}
              submittedImageUrl={completion?.image_url ?? null}
              rejectReason={completion?.reject_reason ?? null}
              formSlot={
                canSubmit ? (
                  cp.verification_methods[0] === "nostr_action" ? (
                    <CheckpointSubmitForm
                      mode="nostr-action"
                      checkpointIndex={idx + 1}
                      nostrActionTargetEventId={
                        cp.nostr_action_target_event_id
                      }
                      error={draft?.error ?? null}
                      loading={submittingCheckpointId === cp.id}
                      onSubmit={() => onSubmitCheckpoint(cp)}
                    />
                  ) : (
                    <CheckpointSubmitForm
                      mode="manual"
                      checkpointIndex={idx + 1}
                      content={draft?.proof ?? ""}
                      image={draft?.image ?? null}
                      error={draft?.error ?? null}
                      loading={submittingCheckpointId === cp.id}
                      onContentChange={(next) =>
                        onDraftChange(cp.id, { proof: next })
                      }
                      onImageChange={(next) =>
                        onDraftChange(cp.id, { image: next })
                      }
                      onSubmit={() => onSubmitCheckpoint(cp)}
                    />
                  )
                ) : null
              }
            />
          );
        })}
      </div>
    </Section>
  );
}
