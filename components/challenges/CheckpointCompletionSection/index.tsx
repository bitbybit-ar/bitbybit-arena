"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Section, SectionTitle } from "@/components/common/Section";
import {
  CheckpointItem,
  type CheckpointItemStatus,
} from "@/components/challenges/CheckpointItem";
import { CheckpointProgress } from "@/components/challenges/CheckpointProgress";
import { CheckpointSubmitForm } from "@/components/challenges/CheckpointSubmitForm";
import type { BlossomDescriptor } from "@/lib/nostr/blossom";
import type { Checkpoint, CheckpointCompletion } from "@/lib/types";
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
  checkpoints: Checkpoint[];
  myCheckpointCompletions: CheckpointCompletion[];
  isParticipant: boolean;
  /** Collapsed per-checkpoint draft state keyed by checkpoint id. */
  drafts: Record<string, CheckpointDraft>;
  onDraftChange: (checkpointId: string, patch: Partial<CheckpointDraft>) => void;
  /** Called when the user hits submit on a given checkpoint. Parent
   *  handles signing + Blossom upload + POST. */
  onSubmitCheckpoint: (checkpoint: Checkpoint) => void;
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
  // Picker state — only one checkpoint's submit form is open at a time.
  // This is the change that drove the redesign: the previous layout
  // expanded every actionable form simultaneously, which was noisy
  // when a parallel-mode challenge had many checkpoints open at once.
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);

  // Resolve per-checkpoint status once so the auto-select effect and
  // the render loop can't drift — both consult the same map. Computed
  // before the early return so the hook order below stays stable
  // regardless of the no-checkpoints branch (Rules of Hooks).
  // useMemo keeps the array reference stable across renders that
  // didn't change the inputs — without it the dependent effect would
  // re-run on every render of the parent.
  const statuses = useMemo<
    { id: string; status: CheckpointItemStatus; canSubmit: boolean }[]
  >(
    () =>
      checkpoints.map((cp, idx) => {
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
        return { id: cp.id, status, canSubmit };
      }),
    [checkpoints, myCheckpointCompletions, isParticipant, checkpointMode]
  );

  // Auto-select the first actionable checkpoint when the viewer joins
  // or when their current selection is no longer actionable (e.g. they
  // just submitted it and it flipped to awaiting-review). Stable hook
  // order: must run before the conditional return below.
  useEffect(() => {
    if (!isParticipant) {
      if (selectedCheckpointId !== null) setSelectedCheckpointId(null);
      return;
    }
    const stillValid =
      selectedCheckpointId !== null &&
      statuses.find((s) => s.id === selectedCheckpointId)?.canSubmit === true;
    if (stillValid) return;
    // Prefer rejected (resubmits are urgent) over plain todos.
    const rejected = statuses.find((s) => s.status === "rejected");
    const firstAvailable = statuses.find((s) => s.canSubmit);
    setSelectedCheckpointId(rejected?.id ?? firstAvailable?.id ?? null);
    // statuses is derived from props; re-running on prop changes is the
    // whole point of this effect, so it's safe to depend on its shape.
  }, [isParticipant, selectedCheckpointId, statuses]);

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
      {isParticipant && statuses.some((s) => s.canSubmit) && (
        <p className={styles.emptyText}>{t("checkpointPickHint")}</p>
      )}
      <div className={styles.checkpointTower}>
        {checkpoints.map((cp, idx) => {
          const completion = myCheckpointCompletions.find(
            (c) => c.checkpoint_id === cp.id
          );
          const { status, canSubmit } = statuses[idx];
          const draft = drafts[cp.id];
          const isSelected = selectedCheckpointId === cp.id;
          return (
            <CheckpointItem
              key={cp.id}
              index={idx + 1}
              title={cp.title}
              description={cp.description}
              status={status}
              submittedContent={completion?.content ?? null}
              submittedImageUrl={completion?.image_url ?? null}
              rejectReason={completion?.reject_reason ?? null}
              selected={isSelected}
              onSelect={canSubmit ? () => setSelectedCheckpointId(cp.id) : undefined}
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
