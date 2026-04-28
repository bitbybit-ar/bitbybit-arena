"use client";

import { useTranslations } from "next-intl";
import { FormInput } from "@/components/ui/form";
import { FieldLabel } from "@/components/common/FieldLabel";
import { OptionCard, OptionCardGroup } from "@/components/common/OptionCard";
import { ImageUpload } from "@/components/common/ImageUpload";
import type { BlossomDescriptor } from "@/lib/nostr/blossom";
import type { VerificationMethod } from "@/lib/types";
import styles from "./verification-section.module.scss";

const VERIFICATION_METHODS: VerificationMethod[] = [
  "creator_approval",
  "automatic",
  "nostr_action",
  "nostr_hashtag",
];

interface VerificationSectionProps {
  verification: VerificationMethod[];
  onToggleVerification: (method: VerificationMethod) => void;
  nostrActionTarget: string;
  onNostrActionTargetChange: (value: string) => void;
  nostrHashtag: string;
  onNostrHashtagChange: (value: string) => void;
  showGoal: boolean;
  goal: string;
  onGoalChange: (value: string) => void;
  unit: string;
  onUnitChange: (value: string) => void;
  badgeName: string;
  onBadgeNameChange: (value: string) => void;
  badgeImage: BlossomDescriptor | null;
  onBadgeImageChange: (value: BlossomDescriptor | null) => void;
}

export function VerificationSection({
  verification,
  onToggleVerification,
  nostrActionTarget,
  onNostrActionTargetChange,
  nostrHashtag,
  onNostrHashtagChange,
  showGoal,
  goal,
  onGoalChange,
  unit,
  onUnitChange,
  badgeName,
  onBadgeNameChange,
  badgeImage,
  onBadgeImageChange,
}: VerificationSectionProps) {
  const t = useTranslations("createChallenge");

  return (
    <>
      <div className={styles.fieldGroup}>
        <FieldLabel
          required
          tooltip={{
            text: t("tooltips.verification.text"),
            example: t("tooltips.verification.example"),
          }}
        >
          {t("verificationLabel")}
        </FieldLabel>
        <OptionCardGroup label={t("verificationLabel")}>
          {VERIFICATION_METHODS.map((method) => (
            <OptionCard
              key={method}
              multi
              title={t(`verificationTypes.${method}`)}
              description={t(`verificationDescriptions.${method}`)}
              selected={verification.includes(method)}
              onToggle={() => onToggleVerification(method)}
            />
          ))}
        </OptionCardGroup>
      </div>

      {verification.includes("nostr_action") && (
        <div className={styles.fieldGroup}>
          <FieldLabel htmlFor="cc-action-target">
            {t("nostrActionTargetLabel")}
          </FieldLabel>
          <FormInput
            id="cc-action-target"
            placeholder={t("nostrActionTargetPlaceholder")}
            value={nostrActionTarget}
            onChange={onNostrActionTargetChange}
          />
        </div>
      )}

      {verification.includes("nostr_hashtag") && (
        <div className={styles.fieldGroup}>
          <FieldLabel htmlFor="cc-hashtag" required>
            {t("nostrHashtagLabel")}
          </FieldLabel>
          <FormInput
            id="cc-hashtag"
            placeholder={t("nostrHashtagPlaceholder")}
            value={nostrHashtag}
            onChange={onNostrHashtagChange}
            required
          />
        </div>
      )}

      {showGoal && (
        <div className={styles.row}>
          <div className={styles.fieldGroup}>
            <FieldLabel htmlFor="cc-goal">{t("goalLabel")}</FieldLabel>
            <FormInput
              id="cc-goal"
              type="number"
              placeholder={t("goalPlaceholder")}
              value={goal}
              onChange={onGoalChange}
            />
          </div>
          <div className={styles.fieldGroup}>
            <FieldLabel htmlFor="cc-unit">{t("unitLabel")}</FieldLabel>
            <FormInput
              id="cc-unit"
              placeholder={t("unitPlaceholder")}
              value={unit}
              onChange={onUnitChange}
            />
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-badge-name"
          tooltip={{
            text: t("tooltips.badgeName.text"),
            example: t("tooltips.badgeName.example"),
          }}
        >
          {t("badgeNameLabel")}
        </FieldLabel>
        <FormInput
          id="cc-badge-name"
          placeholder={t("badgeNamePlaceholder")}
          value={badgeName}
          onChange={onBadgeNameChange}
        />
      </div>

      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-badge-image"
          tooltip={{
            text: t("tooltips.badgeImage.text"),
            example: t("tooltips.badgeImage.example"),
          }}
        >
          {t("badgeImageLabel")}
        </FieldLabel>
        <ImageUpload
          id="cc-badge-image"
          value={badgeImage}
          onChange={onBadgeImageChange}
          alt={badgeName || t("badgeImageLabel")}
          maxSizeMB={2}
        />
      </div>
    </>
  );
}
