"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { BoltIcon } from "@/components/icons";
import { useZapGoalProgress } from "@/lib/hooks/useZapGoalProgress";
import { useZapperMetadata } from "@/lib/hooks/useZapperMetadata";
import type { ZapGoalProgressData } from "@/app/api/challenges/[id]/zap-goal-progress/route";
import { FundPotModal } from "@/components/challenges/FundPotModal";
import { BlockLoader } from "@/components/ui/block-loader";
import styles from "./zap-goal-progress.module.scss";

interface ZapGoalProgressProps {
  goalEventId: string | null;
  goalSats: number;
  challengeTitle: string;
  creatorPubkey: string;
  creatorLightningAddress: string | null;
  /** True once `rewards_paid_at` is set — switch to a "paid" final state. */
  rewardsPaid: boolean;
  /** Optional server snapshot for the first paint. */
  initial?: ZapGoalProgressData | null;
  /**
   * When true, show the "Republish zap goal" recovery button instead of
   * the funding CTA. Passed when the viewer is the creator AND the
   * challenge row has a prize but no `zap_goal_event_id` yet.
   */
  creatorCanRepublish?: boolean;
  onRepublish?: () => void;
  republishLoading?: boolean;
}

// Short, deterministic avatar for a zapper we don't have metadata for.
// DiceBear matches the style used by seeded mock users, so anonymous
// zappers feel visually consistent with the rest of the app.
function avatarUrl(pubkey: string): string {
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${pubkey}`;
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
}

export function ZapGoalProgress({
  goalEventId,
  goalSats,
  challengeTitle,
  creatorPubkey,
  creatorLightningAddress,
  rewardsPaid,
  initial,
  creatorCanRepublish = false,
  onRepublish,
  republishLoading = false,
}: ZapGoalProgressProps) {
  const t = useTranslations("zapGoal");
  const [fundOpen, setFundOpen] = useState(false);

  const { raisedSats, zapperCount, recentZappers, loading, refresh } =
    useZapGoalProgress(goalEventId, goalSats, {
      initial,
      enabled: !!goalEventId,
    });

  // Progressively upgrade the zapper rows from dicebear + short pubkey
  // placeholders to real kind:0 avatars + display names as each lookup
  // resolves. The hook caches per-instance so the same pubkey isn't
  // refetched across re-renders.
  const recentPubkeys = useMemo(
    () => recentZappers.map((z) => z.pubkey),
    [recentZappers]
  );
  const zapperProfiles = useZapperMetadata(recentPubkeys);

  const percent = useMemo(() => {
    if (goalSats <= 0) return 0;
    // Cap the *bar* at 100% but keep the raw numbers visible so
    // over-funding still reads correctly in the "X / Y sats" line.
    return Math.min(100, Math.round((raisedSats / goalSats) * 100));
  }, [raisedSats, goalSats]);

  const overFunded = raisedSats > goalSats && goalSats > 0;

  // Creator hasn't published the goal yet. Two branches: the viewer is
  // the creator (show a retry CTA so they can fix it) or anyone else
  // (hide the panel entirely — no goal to zap, no progress to show).
  if (!goalEventId) {
    if (!creatorCanRepublish) return null;
    return (
      <section className={styles.panel} aria-labelledby="zap-goal-heading">
        <header className={styles.header}>
          <h3 id="zap-goal-heading" className={styles.heading}>
            <BoltIcon size={18} color="var(--color-secondary)" />
            {t("title")}
          </h3>
        </header>
        <p className={styles.notPublished}>{t("notPublished")}</p>
        <button
          className={styles.republishBtn}
          onClick={onRepublish}
          disabled={republishLoading}
        >
          {republishLoading ? t("republishing") : t("republish")}
        </button>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="zap-goal-heading">
      <header className={styles.header}>
        <h3 id="zap-goal-heading" className={styles.heading}>
          <BoltIcon size={18} color="var(--color-secondary)" />
          {t("title")}
        </h3>
        {rewardsPaid && (
          <span className={styles.paidBadge}>{t("distributed")}</span>
        )}
      </header>

      <div
        className={styles.progressBar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goalSats}
        aria-valuenow={raisedSats}
        aria-label={t("ariaProgress", {
          raised: raisedSats,
          goal: goalSats,
        })}
      >
        <div
          className={styles.progressFill}
          style={{ "--fill-width": `${percent}%` } as CSSProperties}
        />
      </div>

      <div className={styles.numbers}>
        <span className={styles.raised}>
          {raisedSats.toLocaleString()}
          <span className={styles.unit}> sats</span>
        </span>
        <span className={styles.ofGoal}>
          {t("ofGoal", { goal: goalSats.toLocaleString() })}
        </span>
      </div>

      <div className={styles.meta}>
        <span className={styles.zapperCount}>
          {t("zappers", { count: zapperCount })}
        </span>
        {overFunded && (
          <span className={styles.overfunded}>{t("overfunded")}</span>
        )}
      </div>

      {recentZappers.length > 0 && (
        <ul className={styles.zapperList}>
          {recentZappers.map((z) => {
            const profile = zapperProfiles.get(z.pubkey);
            const displayName = profile?.display_name ?? shortPubkey(z.pubkey);
            const avatar = profile?.picture ?? avatarUrl(z.pubkey);
            return (
              <li key={`${z.pubkey}-${z.received_at}`} className={styles.zapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.avatar}
                  src={avatar}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    // kind:0 `picture` URLs come from user profiles and
                    // occasionally 404 (dead CDN, deleted file). Fall
                    // back to the deterministic dicebear placeholder so
                    // the row never shows a broken-image icon.
                    const img = e.currentTarget;
                    if (img.src !== avatarUrl(z.pubkey)) {
                      img.src = avatarUrl(z.pubkey);
                    }
                  }}
                />
                <div className={styles.zapperBody}>
                  <div className={styles.zapperRow}>
                    <span className={styles.zapperName}>{displayName}</span>
                    <span className={styles.zapperAmount}>
                      <BoltIcon size={12} color="var(--color-secondary)" />
                      {z.amount_sats.toLocaleString()}
                    </span>
                  </div>
                  {z.message && (
                    <p className={styles.zapperMessage}>{z.message}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!rewardsPaid && (
        <button
          className={styles.fundBtn}
          onClick={() => setFundOpen(true)}
          disabled={!creatorLightningAddress}
        >
          <BoltIcon size={16} color="white" />
          {raisedSats === 0 ? t("beFirst") : t("fundMore")}
        </button>
      )}
      {!rewardsPaid && !creatorLightningAddress && (
        <p className={styles.hint}>{t("creatorNoLud16")}</p>
      )}

      {loading && recentZappers.length === 0 && (
        <BlockLoader label={t("loading")} />
      )}

      {fundOpen && (
        <FundPotModal
          goalEventId={goalEventId}
          creatorPubkey={creatorPubkey}
          creatorLightningAddress={creatorLightningAddress}
          challengeTitle={challengeTitle}
          onClose={() => setFundOpen(false)}
          onZapped={() => {
            // Give the LNURL server a moment to publish its kind:9735,
            // then force a re-pull so the modal's success screen matches
            // the live panel state when the user closes it.
            setTimeout(() => {
              void refresh();
            }, 1500);
          }}
        />
      )}
    </section>
  );
}
