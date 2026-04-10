"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { ArrowRightIcon, BadgeIcon, BoltIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Spinner } from "@/components/ui/spinner";
import { Block } from "@/components/common/Block";
import { buildJoinEvent, buildCompletionEvent, buildBadgeAwardEvent, buildZapRequestEvent } from "@/lib/nostr/events";
import { publishSignedEvent } from "@/lib/nostr/publish";
import { fetchLnurlPayEndpoint, fetchInvoice } from "@/lib/nostr/lnurl";
import { DEFAULT_RELAYS } from "@/lib/nostr/relays";
import { useSession } from "@/lib/contexts/session-context";
import { useSignerContext } from "@/lib/signer-context";
import { SignerRequiredNotice } from "@/components/layout/SignerRequiredNotice";
import styles from "./challenge-detail.module.scss";

interface CheckpointItem {
  id: string;
  challenge_id: string;
  order: number;
  title: string;
  description: string | null;
  verification_type: string;
  nostr_action_target_event_id: string | null;
}

interface CheckpointCompletionItem {
  id: string;
  participant_id: string;
  checkpoint_id: string;
  proof_event_id: string | null;
  content: string | null;
  status: string;
  completed_at: string | null;
}

interface ChallengeDetail {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  verification_type: string;
  nostr_action_target_event_id: string | null;
  checkpoint_mode: "none" | "sequential" | "parallel";
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
  prize_amount_sats: number;
  prize_distribution:
    | "first_to_complete"
    | "winner_takes_all"
    | "split"
    | "tiered"
    | "none"
    | null;
  zap_goal_event_id: string | null;
  rewards_paid_at: string | null;
  creator: { id: string; display_name: string; username: string; nostr_pubkey: string; lightning_address?: string };
  checkpoints: CheckpointItem[];
  my_checkpoint_completions: CheckpointCompletionItem[];
}

interface RewardWinner {
  user_id: string;
  nostr_pubkey: string;
  display_name: string;
  lightning_address: string;
  amount_sats: number;
}

interface CompletionItem {
  id: string;
  content: string | null;
  proof_event_id: string | null;
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
  const { user: sessionUser } = useSession();
  const { needsSigner, signWithPrompt, requestReSignIn } = useSignerContext();
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
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [checkpointProofs, setCheckpointProofs] = useState<Record<string, string>>({});
  const [checkpointErrors, setCheckpointErrors] = useState<Record<string, string>>({});
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [rewardStatus, setRewardStatus] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [challengeRes, completionsRes, participantsRes] = await Promise.all([
        fetch(`/api/challenges/${challengeId}`),
        fetch(`/api/challenges/${challengeId}/completions`),
        fetch(`/api/challenges/${challengeId}/participants`),
      ]);

      const [cJson, compJson, partJson] = await Promise.all([
        challengeRes.json(),
        completionsRes.json(),
        participantsRes.json(),
      ]);

      if (cJson.success) setChallenge(cJson.data);
      if (compJson.success) setCompletions(compJson.data);
      if (partJson.success) setParticipants(partJson.data);

      // Creator/participant flags are derived from the authoritative
      // session in SessionProvider, not from an extra fetch here.
      if (sessionUser && cJson.success) {
        setIsCreator(cJson.data.creator_id === sessionUser.user_id);
        setIsParticipant(
          partJson.success &&
            partJson.data.some(
              (p: ParticipantItem) =>
                p.user_id === sessionUser.user_id && p.status === "active"
            )
        );
      } else {
        setIsCreator(false);
        setIsParticipant(false);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [challengeId, sessionUser]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleJoin = async () => {
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("join");
    await fetch(`/api/challenges/${challengeId}/join`, { method: "POST" });
    if (challenge) {
      try {
        const signed = await signWithPrompt(
          buildJoinEvent(challenge.creator.nostr_pubkey, challenge.slug)
        );
        await publishSignedEvent(signed);
      } catch { /* non-blocking */ }
    }
    await fetchAll();
    setActionLoading(null);
  };

  const handleWithdraw = async () => {
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("withdraw");
    await fetch(`/api/challenges/${challengeId}/join`, { method: "DELETE" });
    await fetchAll();
    setActionLoading(null);
  };

  const handleSubmitProof = async () => {
    if (!proofContent.trim()) return;
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("proof");
    await fetch(`/api/challenges/${challengeId}/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: proofContent }),
    });
    if (challenge) {
      try {
        const signed = await signWithPrompt(
          buildCompletionEvent({
            creatorPubkey: challenge.creator.nostr_pubkey,
            challengeSlug: challenge.slug,
            content: proofContent,
          })
        );
        await publishSignedEvent(signed);
      } catch { /* non-blocking */ }
    }
    setProofContent("");
    await fetchAll();
    setActionLoading(null);
  };

  const handleVerifyLike = async () => {
    setVerifyError(null);
    setActionLoading("verifyLike");
    try {
      const res = await fetch(`/api/challenges/${challengeId}/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json.success) {
        setVerifyError(json.error || t("proofNotFound"));
      } else {
        await fetchAll();
      }
    } catch {
      setVerifyError(t("proofNotFound"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaimReward = async () => {
    if (!challenge) return;
    setRewardError(null);
    setRewardStatus(null);
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("reward");
    try {
      const res = await fetch(`/api/challenges/${challengeId}/reward`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.success) {
        setRewardError(json.error || t("rewardError"));
        return;
      }
      const winners: RewardWinner[] = json.data.winners;
      if (typeof window === "undefined" || !window.webln) {
        setRewardError(t("rewardNoWebln"));
        return;
      }
      await window.webln.enable();

      for (const winner of winners) {
        setRewardStatus(
          t("rewardPaying", {
            name: winner.display_name,
            amount: winner.amount_sats,
          })
        );
        // Build + sign a NIP-57 zap request. eventId is the challenge's
        // Nostr definition event id when present; otherwise fall back to
        // the DB id so the zap request still has an `e` tag.
        const zapRequest = buildZapRequestEvent({
          recipientPubkey: winner.nostr_pubkey,
          eventId: challenge.id,
          amount: winner.amount_sats,
          relays: DEFAULT_RELAYS,
          comment: `BitByBit Arena reward: ${challenge.title}`,
        });
        const signedZap = await signWithPrompt(zapRequest);
        const endpoint = await fetchLnurlPayEndpoint(winner.lightning_address);
        const invoice = await fetchInvoice(
          endpoint.callback,
          winner.amount_sats,
          undefined,
          signedZap
        );
        await window.webln.sendPayment(invoice);
      }

      await fetch(`/api/challenges/${challengeId}/reward`, { method: "PATCH" });
      setRewardStatus(t("rewardSent"));
      await fetchAll();
    } catch (err) {
      setRewardError(
        err instanceof Error ? err.message : t("rewardError")
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteCheckpoint = async (checkpoint: CheckpointItem) => {
    setCheckpointErrors((prev) => {
      const next = { ...prev };
      delete next[checkpoint.id];
      return next;
    });
    setActionLoading(`cp_${checkpoint.id}`);
    try {
      const body: Record<string, unknown> = {};
      if (checkpoint.verification_type !== "nostr_action") {
        const content = checkpointProofs[checkpoint.id] ?? "";
        if (content.trim().length < 5) {
          setCheckpointErrors((prev) => ({
            ...prev,
            [checkpoint.id]: t("proofTooShort"),
          }));
          return;
        }
        body.content = content.trim();
      }
      const res = await fetch(
        `/api/challenges/${challengeId}/checkpoints/${checkpoint.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json();
      if (!json.success) {
        setCheckpointErrors((prev) => ({
          ...prev,
          [checkpoint.id]: json.error || t("checkpointError"),
        }));
        return;
      }
      setCheckpointProofs((prev) => {
        const next = { ...prev };
        delete next[checkpoint.id];
        return next;
      });
      await fetchAll();
    } catch {
      setCheckpointErrors((prev) => ({
        ...prev,
        [checkpoint.id]: t("checkpointError"),
      }));
    } finally {
      setActionLoading(null);
    }
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
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("award");
    await fetch(`/api/challenges/${challengeId}/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: Array.from(selectedWinners) }),
    });
    try {
      const winners = participants.filter((p) => selectedWinners.has(p.user_id));
      for (const winner of winners) {
        if (winner.user.nostr_pubkey) {
          const signed = await signWithPrompt(
            buildBadgeAwardEvent({
              badgeName: challenge.badge_name || challenge.title,
              challengeSlug: challenge.slug,
              creatorPubkey: challenge.creator.nostr_pubkey,
              recipientPubkey: winner.user.nostr_pubkey,
            })
          );
          await publishSignedEvent(signed);
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

          <SignerRequiredNotice />

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

        {/* Checkpoints */}
        {challenge.checkpoint_mode !== "none" && challenge.checkpoints.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {t("checkpointsTitle")} (
              {challenge.my_checkpoint_completions.filter((c) => c.status === "approved").length}
              /{challenge.checkpoints.length})
            </h2>
            <p className={styles.emptyText}>
              {challenge.checkpoint_mode === "sequential"
                ? t("checkpointModeSequential")
                : t("checkpointModeParallel")}
            </p>
            <div className={styles.checkpointTower}>
              {challenge.checkpoints.map((cp, idx) => {
                const completion = challenge.my_checkpoint_completions.find(
                  (c) => c.checkpoint_id === cp.id
                );
                const isDone = completion?.status === "approved";
                const priorIncomplete =
                  challenge.checkpoint_mode === "sequential" &&
                  challenge.checkpoints
                    .slice(0, idx)
                    .some(
                      (earlier) =>
                        !challenge.my_checkpoint_completions.find(
                          (c) =>
                            c.checkpoint_id === earlier.id &&
                            c.status === "approved"
                        )
                    );
                return (
                  <div key={cp.id} className={styles.checkpointItem}>
                    <Block
                      size="small"
                      color={isDone ? "green" : priorIncomplete ? "red" : "purple"}
                    />
                    <div className={styles.checkpointBody}>
                      <div className={styles.checkpointTitleRow}>
                        <span className={styles.checkpointOrder}>
                          {idx + 1}.
                        </span>
                        <strong>{cp.title}</strong>
                        {isDone && (
                          <Tag variant="green">{tCommon("completed")}</Tag>
                        )}
                      </div>
                      {cp.description && (
                        <p className={styles.checkpointDescription}>
                          {cp.description}
                        </p>
                      )}
                      {isParticipant && !isDone && !priorIncomplete && (
                        <div className={styles.checkpointActions}>
                          {cp.verification_type === "nostr_action" ? (
                            <>
                              {cp.nostr_action_target_event_id && (
                                <p className={styles.targetEventId}>
                                  <a
                                    href={`https://njump.me/${cp.nostr_action_target_event_id}`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                  >
                                    {cp.nostr_action_target_event_id.slice(0, 16)}…
                                  </a>
                                </p>
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleCompleteCheckpoint(cp)}
                                disabled={actionLoading === `cp_${cp.id}`}
                              >
                                {actionLoading === `cp_${cp.id}`
                                  ? t("verifying")
                                  : t("verifyLikeButton")}
                              </Button>
                            </>
                          ) : (
                            <>
                              <textarea
                                className={styles.proofInput}
                                placeholder={t("proofPlaceholder")}
                                aria-label={t("checkpointProofLabel", { index: idx + 1 })}
                                value={checkpointProofs[cp.id] ?? ""}
                                onChange={(e) =>
                                  setCheckpointProofs((prev) => ({
                                    ...prev,
                                    [cp.id]: e.target.value,
                                  }))
                                }
                                rows={2}
                              />
                              <Button
                                size="sm"
                                onClick={() => handleCompleteCheckpoint(cp)}
                                disabled={actionLoading === `cp_${cp.id}`}
                              >
                                {actionLoading === `cp_${cp.id}`
                                  ? t("submitting")
                                  : tCommon("submit")}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      {priorIncomplete && (
                        <p className={styles.checkpointLocked}>
                          {t("checkpointLocked")}
                        </p>
                      )}
                      {checkpointErrors[cp.id] && (
                        <p className={styles.error}>{checkpointErrors[cp.id]}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit proof */}
        {isParticipant && challenge.checkpoint_mode === "none" && challenge.verification_type === "nostr_action" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("verifyLikeTitle")}</h2>
            <p className={styles.emptyText}>
              {t("verifyLikeInstructions")}
            </p>
            {challenge.nostr_action_target_event_id && (
              <p className={styles.targetEventId}>
                <a
                  href={`https://njump.me/${challenge.nostr_action_target_event_id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {challenge.nostr_action_target_event_id.slice(0, 16)}…
                </a>
              </p>
            )}
            <Button
              size="sm"
              onClick={handleVerifyLike}
              disabled={actionLoading === "verifyLike"}
            >
              {actionLoading === "verifyLike"
                ? t("verifying")
                : t("verifyLikeButton")}
            </Button>
            {verifyError && <p className={styles.error}>{verifyError}</p>}
          </div>
        )}

        {isParticipant && challenge.checkpoint_mode === "none" && challenge.verification_type !== "nostr_action" && (
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
                  {comp.content && (
                    <p className={styles.completionContent}>{comp.content}</p>
                  )}
                  {comp.proof_event_id && (
                    <p className={styles.completionContent}>
                      <a
                        href={`https://njump.me/${comp.proof_event_id}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {t("proofFound")}: {comp.proof_event_id.slice(0, 16)}…
                      </a>
                    </p>
                  )}
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

        {/* Reward zaps */}
        {isCreator &&
          challenge.prize_amount_sats > 0 &&
          challenge.prize_distribution &&
          challenge.prize_distribution !== "none" &&
          !challenge.rewards_paid_at && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t("rewardSectionTitle")}</h2>
              <p className={styles.emptyText}>
                {t("rewardInstructions", {
                  amount: challenge.prize_amount_sats,
                  mode: tCreate(
                    `rewardZapModes.${challenge.prize_distribution}`
                  ),
                })}
              </p>
              <Button
                size="sm"
                onClick={handleClaimReward}
                disabled={actionLoading === "reward"}
              >
                <BoltIcon size={16} />
                {actionLoading === "reward"
                  ? t("rewardSending")
                  : t("claimReward")}
              </Button>
              {rewardStatus && (
                <p className={styles.emptyText}>{rewardStatus}</p>
              )}
              {rewardError && <p className={styles.error}>{rewardError}</p>}
            </div>
          )}

        {isCreator && challenge.rewards_paid_at && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("rewardSectionTitle")}</h2>
            <p className={styles.emptyText}>{t("rewardAlreadyPaid")}</p>
          </div>
        )}
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
