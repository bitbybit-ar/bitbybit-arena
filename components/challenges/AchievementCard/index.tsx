"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PixelIcon } from "@/components/common/PixelIcon";
import { Button } from "@/components/ui/button";
import type { AchievementItem } from "@/lib/types";
import styles from "./achievement-card.module.scss";

interface AchievementCardProps {
  achievement: AchievementItem;
  /** Fired when the user clicks "Accept on Nostr" on a pending badge.
   *  The parent owns the signer + publish + DB PATCH side-effects so
   *  the card stays presentational. */
  onAccept: (achievement: AchievementItem) => void;
  /** True when any accept is in flight anywhere on the page — the
   *  parent blocks concurrent accepts to avoid dropping previously-
   *  merged pairs on the next kind:30008 publish. */
  accepting: boolean;
  /** True when this specific badge is the one currently being
   *  accepted (drives the button label state). */
  acceptingThis: boolean;
}

export function AchievementCard({
  achievement,
  onAccept,
  accepting,
  acceptingThis,
}: AchievementCardProps) {
  const t = useTranslations("myChallenges");

  return (
    <div className={styles.achievementCard}>
      <Link
        href={`/explore/${achievement.challenge.id}`}
        className={styles.achievementLink}
      >
        <div className={styles.achievementImageWrapper}>
          {achievement.badge_image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={achievement.badge_image_url}
              alt={achievement.badge_name}
              className={styles.achievementImage}
            />
          ) : (
            <div className={styles.achievementImagePlaceholder}>
              <PixelIcon shape="sword" blockSize={8} />
            </div>
          )}
        </div>
        <div className={styles.achievementBody}>
          <h3 className={styles.achievementName}>
            {achievement.badge_name}
          </h3>
          <p className={styles.achievementChallenge}>
            {achievement.challenge.title}
          </p>
          <p className={styles.achievementDate}>
            {new Date(achievement.awarded_at).toLocaleDateString()}
          </p>
        </div>
      </Link>
      {achievement.accepted_at ? (
        <span className={styles.acceptedPill}>
          {t("acceptedOnNostr")}
        </span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAccept(achievement)}
          // Disable all accept buttons while any one is in
          // flight: concurrent accepts race on the latest
          // kind:30008 and can drop previously-merged pairs
          // because neither publish has hit relays yet.
          disabled={accepting}
        >
          {acceptingThis ? t("accepting") : t("acceptBadge")}
        </Button>
      )}
    </div>
  );
}
