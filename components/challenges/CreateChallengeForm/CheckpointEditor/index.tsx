"use client";

import { useTranslations } from "next-intl";
import { FormInput, FormTextarea } from "@/components/ui/form";
import { OptionCard, OptionCardGroup } from "@/components/common/OptionCard";
import type { VerificationMethod } from "@/lib/types";
import styles from "./checkpoint-editor.module.scss";

const VERIFICATION_METHODS: VerificationMethod[] = [
  "creator_approval",
  "automatic",
  "nostr_action",
  "nostr_hashtag",
];

export interface CheckpointDraft {
  title: string;
  description: string;
  verification_methods: VerificationMethod[];
  nostr_action_target_event_id: string;
  nostr_hashtag: string;
}

interface CheckpointEditorProps {
  checkpoints: CheckpointDraft[];
  onChange: (next: CheckpointDraft[]) => void;
}

export function CheckpointEditor({ checkpoints, onChange }: CheckpointEditorProps) {
  const t = useTranslations("createChallenge");

  const toggleCheckpointVerification = (
    idx: number,
    method: VerificationMethod
  ) => {
    onChange(
      checkpoints.map((cp, i) => {
        if (i !== idx) return cp;
        const has = cp.verification_methods.includes(method);
        return {
          ...cp,
          verification_methods: has
            ? cp.verification_methods.filter((m) => m !== method)
            : [...cp.verification_methods, method],
        };
      })
    );
  };

  const addCheckpoint = () => {
    onChange([
      ...checkpoints,
      {
        title: "",
        description: "",
        verification_methods: ["creator_approval"],
        nostr_action_target_event_id: "",
        nostr_hashtag: "",
      },
    ]);
  };

  return (
    <div className={styles.checkpointsSection}>
      <span className={styles.hint}>{t("checkpointsHint")}</span>
      {checkpoints.map((cp, idx) => (
        <div key={idx} className={styles.checkpointRow}>
          <div className={styles.checkpointHeader}>
            <span className={styles.checkpointIndex}>
              {t("checkpointIndex", { index: idx + 1 })}
            </span>
            <button
              type="button"
              className={styles.checkpointRemove}
              onClick={() =>
                onChange(checkpoints.filter((_, i) => i !== idx))
              }
            >
              {t("removeCheckpoint")}
            </button>
          </div>
          <FormInput
            label={t("checkpointTitleLabel")}
            value={cp.title}
            onChange={(v) =>
              onChange(
                checkpoints.map((c, i) => (i === idx ? { ...c, title: v } : c))
              )
            }
            required
          />
          <FormTextarea
            label={t("checkpointDescriptionLabel")}
            value={cp.description}
            onChange={(v) =>
              onChange(
                checkpoints.map((c, i) =>
                  i === idx ? { ...c, description: v } : c
                )
              )
            }
            rows={2}
          />
          <OptionCardGroup label={t("verificationLabel")}>
            {VERIFICATION_METHODS.map((method) => (
              <OptionCard
                key={method}
                multi
                title={t(`verificationTypes.${method}`)}
                selected={cp.verification_methods.includes(method)}
                onToggle={() => toggleCheckpointVerification(idx, method)}
              />
            ))}
          </OptionCardGroup>
          {cp.verification_methods.includes("nostr_action") && (
            <FormInput
              label={t("nostrActionTargetLabel")}
              placeholder={t("nostrActionTargetPlaceholder")}
              value={cp.nostr_action_target_event_id}
              onChange={(v) =>
                onChange(
                  checkpoints.map((c, i) =>
                    i === idx
                      ? { ...c, nostr_action_target_event_id: v }
                      : c
                  )
                )
              }
            />
          )}
          {cp.verification_methods.includes("nostr_hashtag") && (
            <FormInput
              label={t("nostrHashtagLabel")}
              placeholder={t("nostrHashtagPlaceholder")}
              value={cp.nostr_hashtag}
              onChange={(v) =>
                onChange(
                  checkpoints.map((c, i) =>
                    i === idx ? { ...c, nostr_hashtag: v } : c
                  )
                )
              }
            />
          )}
        </div>
      ))}
      <button type="button" className={styles.addCheckpoint} onClick={addCheckpoint}>
        + {t("addCheckpoint")}
      </button>
    </div>
  );
}
