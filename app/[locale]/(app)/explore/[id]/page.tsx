"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { ArrowRightIcon, CheckIcon, FlagIcon, BadgeIcon, BoltIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Spinner } from "@/components/ui/spinner";
import { buildJoinEvent, buildCompletionEvent, buildBadgeAwardEvent } from "@/lib/nostr/events";
import { signAndPublish } from "@/lib/nostr/publish";
import styles from "./challenge-detail.module.scss";

interface ChallengeDetail {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  verification_type: string;
  goal: number | null;
  unit: string | null;
  category: string | null;
  badge_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  participant_count: number;
  completion_count: number;
  creator_id: string;
  slug: string;
  creator: { id: string; display_name: string; username: string; nostr_pubkey: string; lightning_address?: string };
}

interface CompletionItem {
  id: string;
  content: string;
  status: string;
  submitted_at: string;
  user: { id: string; display_name: string; username: string; nostr_pubkey?: string };
}

interface ParticipantItem {
  id: string;
  user_id: string;
  status: string;
  progress: number;
  user: { id: string; display_name: string; username: string; nostr_pubkey?: string };
}

export default function ChallengeDetailPage() {
  const t = useTranslations("challenge");
  const tCommon = useTranslations("common");
  const tCreate = useTranslations("createChallenge");
  const router = useRouter();
  const params = useParams();
  const challengeId = params.id as string;

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [completions, setCompletions] = useState<CompletionItem[]>([]);
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [isParticipant, setIsParticipant] = useState(false);
  const [proofContent, setProofContent] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedWinners, setSelectedWinners] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    try {
      const [challengeRes, completionsRes, participantsRes, sessionRes] = await Promise.all([
        fetch(`/api/challenges/${challengeId}`),
        fetch(`/api/challenges/${challengeId}/completions`),
        fetch(`/api/challenges/${challengeId}/participants`),
        fetch("/api/auth/session"),
      ]);

      const [cJson, compJson, partJson, sessJson] = await Promise.all([
        challengeRes.json(),
        completionsRes.json(),
        participantsRes.json(),
        sessionRes.json(),
      ]);

      if (cJson.success) setChallenge(cJson.data);
      if (compJson.success) setCompletions(compJson.data);
      if (partJson.success) setParticipants(partJson.data);

      if (sessJson.success && cJson.success) {
        const userId = sessJson.data.user_id;
        setIsCreator(cJson.data.creator_id === userId);
        setIsParticipant(
          partJson.success && partJson.data.some(
            (p: ParticipantItem) => p.user_id === userId && p.status === "active"
          )
        );
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleJoin = async () => {
    setActionLoading("join");
    await fetch(`/api/challenges/${challengeId}/join`, { method: "POST" });
    // Publish join event to Nostr (best-effort)
    if (challenge) {
      try {
        await signAndPublish(buildJoinEvent(challenge.creator.nostr_pubkey, challenge.slug));
      } catch { /* non-blocking */ }
    }
    await fetchAll();
    setActionLoading(null);
  };

  const handleWithdraw = async () => {
    setActionLoading("withdraw");
    await fetch(`/api/challenges/${challengeId}/join`, { method: "DELETE" });
    await fetchAll();
    setActionLoading(null);
  };

  const handleSubmitProof = async () => {
    if (!proofContent.trim()) return;
    setActionLoading("proof");
    await fetch(`/api/challenges/${challengeId}/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: proofContent }),
    });
    // Publish completion event to Nostr (best-effort)
    if (challenge) {
      try {
        await signAndPublish(buildCompletionEvent({
          creatorPubkey: challenge.creator.nostr_pubkey,
          challengeSlug: challenge.slug,
          content: proofContent,
        }));
      } catch { /* non-blocking */ }
    }
    setProofContent("");
    await fetchAll();
    setActionLoading(null);
  };

  const handleVerify = async (completionId: string, status: "approved" | "rejected") => {
    setActionLoading(completionId);
    await fetch(`/api/completions/${completionId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchAll();
    setActionLoading(null);
  };

  const handleAwardBadges = async () => {
    if (selectedWinners.size === 0 || !challenge) return;
    setActionLoading("award");
    await fetch(`/api/challenges/${challengeId}/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: Array.from(selectedWinners) }),
    });
    // Publish badge award events to Nostr (best-effort)
    try {
      const winners = participants.filter((p) => selectedWinners.has(p.user_id));
      for (const winner of winners) {
        if (winner.user.nostr_pubkey) {
          await signAndPublish(buildBadgeAwardEvent({
            badgeName: challenge.badge_name || challenge.title,
            challengeSlug: challenge.slug,
            creatorPubkey: challenge.creator.nostr_pubkey,
            recipientPubkey: winner.user.nostr_pubkey,
          }));
        }
      }
    } catch { /* non-blocking */ }
    setSelectedWinners(new Set());
    await fetchAll();
    setActionLoading(null);
  };

  const toggleWinner = (userId: string) => {
    setSelectedWinners((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className={styles.emptyState}>
        <p>Challenge not found</p>
        <Button variant="outline" onClick={() => router.push("/explore")}>
          {tCommon("back")}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button className={styles.backButton} onClick={() => router.push("/explore")}>
        <ArrowRightIcon size={16} /> {tCommon("back")}
      </button>

      <div className={styles.main}>
        {/* Challenge info */}
        <div className={styles.challengeCard}>
          <Tag variant={typeVariant(challenge.type)}>
            {tCreate(`types.${challenge.type}`)}
          </Tag>
          <h1 className={styles.challengeTitle}>{challenge.title}</h1>
          <p className={styles.creator}>
            {t("by")} {challenge.creator.display_name}
          </p>
          <p className={styles.description}>{challenge.description}</p>

          <div className={styles.details}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t("status")}</span>
              <span>{tCommon(statusKey(challenge.status))}</span>
            </div>
            {challenge.goal && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t("goal")}</span>
                <span>{challenge.goal} {challenge.unit}</span>
              </div>
            )}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t("verification")}</span>
              <span>{tCreate(`verificationTypes.${challenge.verification_type}`)}</span>
            </div>
            {challenge.ends_at && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t("ends")}</span>
                <span>{new Date(challenge.ends_at).toLocaleDateString()}</span>
              </div>
            )}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t("participants")}</span>
              <span>{challenge.participant_count}</span>
            </div>
          </div>

          {/* Actions */}
          {!isCreator && !isParticipant && challenge.status === "open" && (
            <Button onClick={handleJoin} disabled={actionLoading === "join"}>
              {actionLoading === "join" ? t("joining") : t("joinChallenge")}
            </Button>
          )}
          {isParticipant && (
            <Button variant="outline" onClick={handleWithdraw} disabled={actionLoading === "withdraw"}>
              {actionLoading === "withdraw" ? t("withdrawing") : t("withdrawFromChallenge")}
            </Button>
          )}
          {isCreator && (
            <p className={styles.creatorBadge}>{t("yourChallenge")}</p>
          )}
        </div>

        {/* Submit proof */}
        {isParticipant && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("submitProof")}</h2>
            <textarea
              className={styles.proofInput}
              placeholder={t("proofPlaceholder")}
              value={proofContent}
              onChange={(e) => setProofContent(e.target.value)}
              rows={3}
            />
            <Button
              size="sm"
              onClick={handleSubmitProof}
              disabled={!proofContent.trim() || actionLoading === "proof"}
            >
              {actionLoading === "proof" ? t("submitting") : tCommon("submit")}
            </Button>
          </div>
        )}

        {/* Completions */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("completions")} ({completions.length})</h2>
          {completions.length === 0 ? (
            <p className={styles.emptyText}>{t("noCompletions")}</p>
          ) : (
            <div className={styles.completionList}>
              {completions.map((comp) => (
                <div key={comp.id} className={styles.completionCard}>
                  <div className={styles.completionHeader}>
                    <span className={styles.completionUser}>{comp.user.display_name}</span>
                    <Tag variant={comp.status === "approved" ? "green" : comp.status === "rejected" ? "red" : "gold"}>
                      {tCommon(comp.status)}
                    </Tag>
                  </div>
                  <p className={styles.completionContent}>{comp.content}</p>
                  {comp.user.nostr_pubkey && challenge.creator.lightning_address && (
                    <button
                      className={styles.zapButton}
                      onClick={() => window.open(`lightning:${challenge.creator.lightning_address}`, "_blank")}
                      title="Zap"
                    >
                      <BoltIcon size={14} /> Zap
                    </button>
                  )}
                  {isCreator && comp.status === "pending" && (
                    <div className={styles.verifyActions}>
                      <Button size="sm" onClick={() => handleVerify(comp.id, "approved")} disabled={actionLoading === comp.id}>
                        {actionLoading === comp.id ? t("approving") : tCommon("approve")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleVerify(comp.id, "rejected")} disabled={actionLoading === comp.id}>
                        {tCommon("reject")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Participants + Award */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("participants")} ({participants.length})</h2>
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
                        onChange={() => toggleWinner(p.user_id)}
                      />
                    )}
                    <span className={styles.participantName}>{p.user.display_name}</span>
                    <Tag variant={p.status === "completed" ? "green" : "purple"}>
                      {tCommon(p.status)}
                    </Tag>
                    {challenge.goal && (
                      <span className={styles.participantProgress}>
                        {p.progress}/{challenge.goal}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {isCreator && selectedWinners.size > 0 && (
                <Button size="sm" onClick={handleAwardBadges} disabled={actionLoading === "award"}>
                  <BadgeIcon size={16} />
                  {actionLoading === "award" ? t("awarding") : `${t("awardBadges")} (${selectedWinners.size})`}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function typeVariant(type: string): "purple" | "gold" | "green" | "red" {
  switch (type) {
    case "streak": return "gold";
    case "competition": return "red";
    case "creative": return "green";
    default: return "purple";
  }
}

function statusKey(status: string): string {
  switch (status) {
    case "in_progress": return "inProgress";
    default: return status;
  }
}
