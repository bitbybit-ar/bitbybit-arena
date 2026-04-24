"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FormInput } from "@/components/ui/form";
import { Tooltip } from "@/components/common/Tooltip";
import { OptionCard, OptionCardGroup } from "@/components/common/OptionCard";
import styles from "./reward-section.module.scss";

// Source of truth for the prize-distribution modes the form supports.
// The parent orchestrator imports this instead of redeclaring so the
// two shapes can't silently drift if a new mode is ever added.
export type RewardZapMode = "first_to_complete" | "split" | "tiered";

// Small helper: label + optional tooltip rendered as sibling of the <label>,
// not a child. Avoids the "click tooltip → focus input" side effect caused by
// nesting interactive elements inside a <label htmlFor>.
function FieldLabel({
  htmlFor,
  children,
  tooltip,
  required,
}: {
  htmlFor?: string;
  children: ReactNode;
  tooltip?: { text: string; example?: string };
  required?: boolean;
}) {
  const inner = (
    <>
      {children}
      {required && <span className={styles.required}>*</span>}
    </>
  );
  return (
    <div className={styles.labelRow}>
      {htmlFor ? <label htmlFor={htmlFor}>{inner}</label> : <span>{inner}</span>}
      {tooltip && <Tooltip text={tooltip.text} example={tooltip.example} />}
    </div>
  );
}

interface RewardSectionProps {
  prizeAmountSats: string;
  onPrizeAmountChange: (sats: string) => void;
  prizeDistribution: RewardZapMode;
  onPrizeDistributionChange: (mode: RewardZapMode) => void;
}

export function RewardSection({
  prizeAmountSats,
  onPrizeAmountChange,
  prizeDistribution,
  onPrizeDistributionChange,
}: RewardSectionProps) {
  const t = useTranslations("createChallenge");

  return (
    <>
      <div className={styles.fieldGroup}>
        <FieldLabel
          htmlFor="cc-prize"
          tooltip={{
            text: t("tooltips.prize.text"),
            example: t("tooltips.prize.example"),
          }}
        >
          {t("prizeAmountLabel")}
        </FieldLabel>
        <FormInput
          id="cc-prize"
          type="number"
          placeholder={t("prizeAmountPlaceholder")}
          value={prizeAmountSats}
          onChange={onPrizeAmountChange}
        />
      </div>

      {prizeAmountSats && Number(prizeAmountSats) > 0 && (
        <>
          <div className={styles.fieldGroup}>
            <FieldLabel
              tooltip={{
                text: t("tooltips.rewardZapMode.text"),
                example: t("tooltips.rewardZapMode.example"),
              }}
            >
              {t("rewardZapModeLabel")}
            </FieldLabel>
            <OptionCardGroup label={t("rewardZapModeLabel")}>
              {(["first_to_complete", "split", "tiered"] as RewardZapMode[]).map(
                (mode) => (
                  <OptionCard
                    key={mode}
                    title={t(`rewardZapModes.${mode}`)}
                    description={t(`rewardZapModeDescriptions.${mode}`)}
                    selected={prizeDistribution === mode}
                    onToggle={() => onPrizeDistributionChange(mode)}
                  />
                )
              )}
            </OptionCardGroup>
          </div>
          <p className={styles.zapGoalNote}>{t("zapGoalAutoNote")}</p>
        </>
      )}
    </>
  );
}
