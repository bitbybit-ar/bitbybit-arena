"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { FormInput, FormTextarea, FormSelect, FormButton } from "@/components/ui/form";
import { buildChallengeEvent } from "@/lib/nostr/events";
import { publishSignedEvent } from "@/lib/nostr/publish";
import { useSignerContext } from "@/lib/signer-context";
import styles from "./create-challenge.module.scss";

interface CreateChallengeModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateChallengeModal({ onClose, onCreated }: CreateChallengeModalProps) {
  const t = useTranslations("createChallenge");
  const { needsSigner, signWithPrompt, requestReSignIn } = useSignerContext();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("one_time");
  const [category, setCategory] = useState("");
  const [goal, setGoal] = useState("");
  const [unit, setUnit] = useState("");
  const [verification, setVerification] = useState("creator_approval");
  const [nostrActionTarget, setNostrActionTarget] = useState("");
  const [checkpointMode, setCheckpointMode] = useState<
    "none" | "sequential" | "parallel"
  >("none");
  const [checkpoints, setCheckpoints] = useState<
    Array<{
      title: string;
      description: string;
      verification_type: "creator_approval" | "automatic" | "nostr_action";
      nostr_action_target_event_id: string;
    }>
  >([]);
  const [badgeName, setBadgeName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure we have both a valid session cookie AND an in-memory signer
    // before hitting /api/challenges. Covers anonymous users (login flow)
    // and reattach users (session still valid, key needs to come back).
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return; // user cancelled the modal
      }
    }
    if (verification === "nostr_action") {
      if (!/^[0-9a-f]{64}$/i.test(nostrActionTarget.trim())) {
        setError(t("nostrActionTargetError"));
        return;
      }
    }

    if (checkpointMode !== "none") {
      if (checkpoints.length === 0) {
        setError(t("checkpointsEmptyError"));
        return;
      }
      for (let i = 0; i < checkpoints.length; i += 1) {
        const cp = checkpoints[i];
        if (cp.title.trim().length < 3) {
          setError(t("checkpointTitleError", { index: i + 1 }));
          return;
        }
        if (
          cp.verification_type === "nostr_action" &&
          !/^[0-9a-f]{64}$/i.test(cp.nostr_action_target_event_id.trim())
        ) {
          setError(t("checkpointTargetError", { index: i + 1 }));
          return;
        }
      }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          type,
          category: category || undefined,
          goal: goal ? Number(goal) : undefined,
          unit: unit || undefined,
          verification_type: verification,
          nostr_action_target_event_id:
            verification === "nostr_action"
              ? nostrActionTarget.trim().toLowerCase()
              : undefined,
          checkpoint_mode: checkpointMode,
          checkpoints:
            checkpointMode !== "none"
              ? checkpoints.map((cp) => ({
                  title: cp.title.trim(),
                  description: cp.description.trim() || null,
                  verification_type: cp.verification_type,
                  nostr_action_target_event_id:
                    cp.verification_type === "nostr_action"
                      ? cp.nostr_action_target_event_id.trim().toLowerCase()
                      : null,
                }))
              : undefined,
          badge_name: badgeName || undefined,
          starts_at: startsAt || undefined,
          ends_at: endsAt || undefined,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error);
        return;
      }

      // Publish challenge event to Nostr relays. Sign via the active
      // SignerProvider signer; opens ReSignInModal if no signer is loaded.
      try {
        const challengeEvent = buildChallengeEvent({
          slug: json.data.slug,
          title,
          description,
          type,
          category: category || undefined,
          goal: goal ? Number(goal) : undefined,
          unit: unit || undefined,
          verification,
          badgeName: badgeName || undefined,
          startsAt: startsAt || undefined,
          endsAt: endsAt || undefined,
        });
        const signed = await signWithPrompt(challengeEvent);
        await publishSignedEvent(signed);
      } catch {
        // Non-blocking: challenge is created in DB even if Nostr publish fails
      }

      onCreated();
    } catch {
      setError("Failed to create challenge");
    } finally {
      setLoading(false);
    }
  };

  const showGoal = type === "streak" || type === "competition";

  return (
    <Modal onClose={onClose} title={t("title")} size="lg">
      <form onSubmit={handleSubmit} className={styles.form}>
        <FormInput
          label={t("nameLabel")}
          placeholder={t("namePlaceholder")}
          value={title}
          onChange={setTitle}
          required
        />

        <FormTextarea
          label={t("descriptionLabel")}
          placeholder={t("descriptionPlaceholder")}
          value={description}
          onChange={setDescription}
          rows={3}
          required
        />

        <div className={styles.row}>
          <FormSelect
            label={t("typeLabel")}
            value={type}
            onChange={setType}
          >
            <option value="one_time">{t("types.one_time")}</option>
            <option value="streak">{t("types.streak")}</option>
            <option value="competition">{t("types.competition")}</option>
            <option value="race">{t("types.race")}</option>
            <option value="creative">{t("types.creative")}</option>
          </FormSelect>

          <FormInput
            label={t("categoryLabel")}
            placeholder={t("categoryPlaceholder")}
            value={category}
            onChange={setCategory}
          />
        </div>

        {showGoal && (
          <div className={styles.row}>
            <FormInput
              label={t("goalLabel")}
              placeholder={t("goalPlaceholder")}
              type="number"
              value={goal}
              onChange={setGoal}
            />
            <FormInput
              label={t("unitLabel")}
              placeholder={t("unitPlaceholder")}
              value={unit}
              onChange={setUnit}
            />
          </div>
        )}

        <FormSelect
          label={t("verificationLabel")}
          value={verification}
          onChange={setVerification}
        >
          <option value="creator_approval">{t("verificationTypes.creator_approval")}</option>
          <option value="automatic">{t("verificationTypes.automatic")}</option>
          <option value="nostr_action">{t("verificationTypes.nostr_action")}</option>
        </FormSelect>

        {verification === "nostr_action" && (
          <FormInput
            label={t("nostrActionTargetLabel")}
            placeholder={t("nostrActionTargetPlaceholder")}
            value={nostrActionTarget}
            onChange={setNostrActionTarget}
            required
          />
        )}

        <FormSelect
          label={t("checkpointModeLabel")}
          value={checkpointMode}
          onChange={(v) =>
            setCheckpointMode(v as "none" | "sequential" | "parallel")
          }
        >
          <option value="none">{t("checkpointModes.none")}</option>
          <option value="sequential">{t("checkpointModes.sequential")}</option>
          <option value="parallel">{t("checkpointModes.parallel")}</option>
        </FormSelect>

        {checkpointMode !== "none" && (
          <div className={styles.checkpointsSection}>
            <p className={styles.checkpointsHint}>
              {t("checkpointsHint")}
            </p>
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
                      setCheckpoints((prev) =>
                        prev.filter((_, i) => i !== idx)
                      )
                    }
                  >
                    {t("removeCheckpoint")}
                  </button>
                </div>
                <FormInput
                  label={t("checkpointTitleLabel")}
                  value={cp.title}
                  onChange={(v) =>
                    setCheckpoints((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, title: v } : c))
                    )
                  }
                  required
                />
                <FormTextarea
                  label={t("checkpointDescriptionLabel")}
                  value={cp.description}
                  onChange={(v) =>
                    setCheckpoints((prev) =>
                      prev.map((c, i) =>
                        i === idx ? { ...c, description: v } : c
                      )
                    )
                  }
                  rows={2}
                />
                <FormSelect
                  label={t("verificationLabel")}
                  value={cp.verification_type}
                  onChange={(v) =>
                    setCheckpoints((prev) =>
                      prev.map((c, i) =>
                        i === idx
                          ? {
                              ...c,
                              verification_type: v as
                                | "creator_approval"
                                | "automatic"
                                | "nostr_action",
                            }
                          : c
                      )
                    )
                  }
                >
                  <option value="creator_approval">
                    {t("verificationTypes.creator_approval")}
                  </option>
                  <option value="automatic">
                    {t("verificationTypes.automatic")}
                  </option>
                  <option value="nostr_action">
                    {t("verificationTypes.nostr_action")}
                  </option>
                </FormSelect>
                {cp.verification_type === "nostr_action" && (
                  <FormInput
                    label={t("nostrActionTargetLabel")}
                    placeholder={t("nostrActionTargetPlaceholder")}
                    value={cp.nostr_action_target_event_id}
                    onChange={(v) =>
                      setCheckpoints((prev) =>
                        prev.map((c, i) =>
                          i === idx
                            ? { ...c, nostr_action_target_event_id: v }
                            : c
                        )
                      )
                    }
                    required
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              className={styles.addCheckpoint}
              onClick={() =>
                setCheckpoints((prev) => [
                  ...prev,
                  {
                    title: "",
                    description: "",
                    verification_type: "creator_approval",
                    nostr_action_target_event_id: "",
                  },
                ])
              }
            >
              + {t("addCheckpoint")}
            </button>
          </div>
        )}

        <FormInput
          label={t("badgeNameLabel")}
          placeholder={t("badgeNamePlaceholder")}
          value={badgeName}
          onChange={setBadgeName}
        />

        <div className={styles.row}>
          <FormInput
            label={t("startsAtLabel")}
            type="date"
            value={startsAt}
            onChange={setStartsAt}
          />
          <FormInput
            label={t("endsAtLabel")}
            type="date"
            value={endsAt}
            onChange={setEndsAt}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <FormButton type="submit" loading={loading} loadingText={t("creating")}>
          {t("title")}
        </FormButton>
      </form>
    </Modal>
  );
}
