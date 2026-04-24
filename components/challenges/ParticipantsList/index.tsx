"use client";

import { useTranslations } from "next-intl";
import { BadgeIcon } from "@/components/icons";
import { Section, SectionTitle } from "@/components/common/Section";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import styles from "./participants-list.module.scss";

export interface ParticipantItem {
  id: string;
  user_id: string;
  status: string;
  progress: number;
  user: { id: string; display_name: string; username: string; nostr_pubkey?: string };
}

interface ParticipantsListProps {
  participants: ParticipantItem[];
  /** Creator-only UI bits (checkboxes + award button). */
  isCreator: boolean;
  /** Per-participant goal target rendered next to progress. Null when the
   *  challenge has no goal configured. */
  goal: number | null;
  selectedWinners: Set<string>;
  onToggleWinner: (userId: string) => void;
  onAwardBadges: () => void;
  /** Parent's action-loading sentinel for the award button. */
  awardLoading: boolean;
}

export function ParticipantsList({
  participants,
  isCreator,
  goal,
  selectedWinners,
  onToggleWinner,
  onAwardBadges,
  awardLoading,
}: ParticipantsListProps) {
  const t = useTranslations("challenge");
  const tCommon = useTranslations("common");

  return (
    <Section>
      <SectionTitle>{t("participants")} ({participants.length})</SectionTitle>
      {participants.length === 0 ? (
        <p className={styles.emptyText}>{t("noParticipants")}</p>
      ) : (
        <>
          <div className={styles.participantList}>
            {participants.map((p) => (
              <div key={p.id} className={styles.participantRow}>
                {isCreator && (
                  <input
                    type="checkbox"
                    checked={selectedWinners.has(p.user_id)}
                    onChange={() => onToggleWinner(p.user_id)}
                  />
                )}
                <span className={styles.participantName}>{p.user.display_name}</span>
                <Tag variant={p.status === "completed" ? "green" : "purple"}>
                  {tCommon(p.status)}
                </Tag>
                {goal && (
                  <span className={styles.participantProgress}>
                    {p.progress}/{goal}
                  </span>
                )}
              </div>
            ))}
          </div>
          {isCreator && selectedWinners.size > 0 && (
            <Button size="sm" onClick={onAwardBadges} disabled={awardLoading}>
              <BadgeIcon size={16} />
              {awardLoading ? t("awarding") : `${t("awardBadges")} (${selectedWinners.size})`}
            </Button>
          )}
        </>
      )}
    </Section>
  );
}
