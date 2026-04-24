"use client";

import { useTranslations } from "next-intl";
import { BoltIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { PrizeDistribution } from "@/lib/types";
import styles from "./reward-distribution-panel.module.scss";

interface RewardDistributionPanelProps {
  /** Only creators see this panel. Parent can also omit the component
   *  entirely; the flag is kept so the panel renders nothing gracefully
   *  if the caller forgets. */
  isCreator: boolean;
  prizeAmountSats: number;
  prizeDistribution: PrizeDistribution | null;
  rewardsPaidAt: string | null;
  resultNostrEventId: string | null;
  /** Parent's `actionLoading` sentinel — the panel only needs to know
   *  which of its two buttons is active, not the full state machine. */
  claimLoading: boolean;
  republishResultLoading: boolean;
  rewardStatus: string | null;
  rewardError: string | null;
  onClaimReward: () => void;
  onRepublishResult: () => void;
}

export function RewardDistributionPanel({
  isCreator,
  prizeAmountSats,
  prizeDistribution,
  rewardsPaidAt,
  resultNostrEventId,
  claimLoading,
  republishResultLoading,
  rewardStatus,
  rewardError,
  onClaimReward,
  onRepublishResult,
}: RewardDistributionPanelProps) {
  const t = useTranslations("challenge");
  const tCreate = useTranslations("createChallenge");

  if (!isCreator) return null;

  return (
    <>
      {/* Reward zaps */}
      {prizeAmountSats > 0 &&
        prizeDistribution &&
        prizeDistribution !== "none" &&
        !rewardsPaidAt && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("rewardSectionTitle")}</h2>
            <p className={styles.emptyText}>
              {t("rewardInstructions", {
                amount: prizeAmountSats,
                mode: tCreate(
                  `rewardZapModes.${prizeDistribution}`
                ),
              })}
            </p>
            <Button
              size="sm"
              onClick={onClaimReward}
              disabled={claimLoading}
            >
              <BoltIcon size={16} />
              {claimLoading
                ? t("rewardSending")
                : t("claimReward")}
            </Button>
            {rewardStatus && (
              <p className={styles.emptyText}>{rewardStatus}</p>
            )}
            {rewardError && <p className={styles.error}>{rewardError}</p>}
          </div>
        )}

      {rewardsPaidAt && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("rewardSectionTitle")}</h2>
          <p className={styles.emptyText}>{t("rewardAlreadyPaid")}</p>
          {!resultNostrEventId && (
            <>
              <p className={styles.emptyText}>
                {t("republishResultHint")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={onRepublishResult}
                disabled={republishResultLoading}
              >
                {republishResultLoading
                  ? t("republishingResult")
                  : t("republishResult")}
              </Button>
              {rewardStatus && (
                <p className={styles.emptyText}>{rewardStatus}</p>
              )}
              {rewardError && (
                <p className={styles.error}>{rewardError}</p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
