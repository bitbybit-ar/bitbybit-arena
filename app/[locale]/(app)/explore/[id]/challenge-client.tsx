"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useParams, useSearchParams, notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { Link, useRouter } from "@/i18n/routing";
import { ArrowRightIcon, BoltIcon, CopyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Modal } from "@/components/ui/modal";
import { BlockLoader } from "@/components/ui/block-loader";

// QR + image-upload are heavy and only render after specific user
// actions (open the reward modal, attach a proof). Splitting them out
// keeps them off the initial /explore/<id> bundle so the page TTFI
// doesn't pay for code most viewers never reach.
const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((m) => m.QRCodeSVG),
  { ssr: false }
);
const ImageUpload = dynamic(
  () => import("@/components/common/ImageUpload").then((m) => m.ImageUpload),
  { ssr: false }
);
import { Avatar, type AvatarStatus } from "@/components/common/Avatar";
import { EmptyState } from "@/components/common/EmptyState";
import { PixelIcon } from "@/components/common/PixelIcon";
import { Section, SectionTitle } from "@/components/common/Section";
import {
  CheckpointCompletionSection,
  type CheckpointDraft,
} from "@/components/challenges/CheckpointCompletionSection";
import { CheckpointSubmissionCard } from "@/components/challenges/CheckpointSubmissionCard";
import { RewardDistributionPanel } from "@/components/challenges/RewardDistributionPanel";
import { useClipboard } from "@/lib/hooks/useClipboard";
import { cn } from "@/lib/utils";
import { fetchNostrMetadata, fetchLatestEventOfKind } from "@/lib/nostr/metadata";
import {
  buildJoinEvent,
  buildCheckpointCompletionEvent,
  buildCompletionEvent,
  buildBadgeAwardEvent,
  buildBadgeDefinitionEvent,
  buildChallengeResultEvent,
  buildProfileBadgesEvent,
  buildZapGoalEvent,
  buildZapRequestEvent,
  parseProfileBadgesPairs,
  placeLabel,
  type ChallengeResultWinner,
} from "@/lib/nostr/events";
import { ZapGoalProgress } from "@/components/challenges/ZapGoalProgress";
import type { BlossomDescriptor } from "@/lib/nostr/blossom";
import { publishSignedEvent } from "@/lib/nostr/publish";
import { fetchLnurlPayEndpoint, fetchInvoice } from "@/lib/nostr/lnurl";
import { awaitZapReceipt } from "@/lib/nostr/await-zap-receipt";
import { DEFAULT_RELAYS } from "@/lib/nostr/relays";
import { useSession } from "@/lib/contexts/session-context";
import { useSignerContext } from "@/lib/signer-context";
import { useToast } from "@/components/ui/toast";
import { translateApiError } from "@/lib/api/translate-error";
import { MAX_REJECT_REASON_LEN } from "@/lib/schemas/completions";
import type {
  AchievementItem,
  ChallengeCheckpointCompletion,
  Checkpoint,
  ParticipantItem,
  PendingCheckpointSubmission,
  VerificationMethod,
} from "@/lib/types";
import { SignerRequiredNotice } from "@/components/layout/SignerRequiredNotice";
import { type ShareContext } from "@/components/share/ShareOnNostrModal";
import styles from "./challenge-detail.module.scss";
import type {
  ChallengeDetail,
  CompletionItem,
  PayableWinner,
  RewardWinner,
} from "./types";
import {
  REWARD_POLL_INTERVAL_MS,
  deriveManageRoster,
  deriveMyProgress,
  rollUpStatus,
  statusKey,
  typeVariant,
  updateCheckpointDraft,
} from "./helpers";
import { AvatarStack } from "./AvatarStack";
import { NostrVerifySection } from "./NostrVerifySection";

// Share modal is mounted only after the user submits/joins/etc., so
// we lazy-load it to keep the click-to-render bundle off the page-load
// path. The trade-off is a first-render delay on the modal — invisible
// to humans because the modal opens behind a state transition anyway.
const ShareOnNostrModal = dynamic(
  () =>
    import("@/components/share/ShareOnNostrModal").then(
      (m) => m.ShareOnNostrModal
    ),
  { ssr: false }
);

export default function ChallengeClient() {
  const t = useTranslations("challenge");
  const tCommon = useTranslations("common");
  const tCreate = useTranslations("createChallenge");
  const tErr = useTranslations("errors.codes");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user: sessionUser } = useSession();
  const { needsSigner, signWithPrompt, requestReSignIn } = useSignerContext();
  const { showToast } = useToast();
  const challengeId = params.id as string;

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [completions, setCompletions] = useState<CompletionItem[]>([]);
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [isParticipant, setIsParticipant] = useState(false);
  const [proofContent, setProofContent] = useState("");
  const [proofImageDescriptor, setProofImageDescriptor] =
    useState<BlossomDescriptor | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // The signed-in user's badge row for THIS challenge, if any.
  // Drives the "You earned a badge!" banner (when accepted_at is null)
  // and the creator-as-participant one-step recovery flow (when the
  // creator has an approved completion but no badge row yet, or has
  // a row that they never accepted on Nostr).
  const [myBadge, setMyBadge] = useState<AchievementItem | null>(null);
  const hasPendingBadge = !!myBadge && !myBadge.accepted_at;
  // Tab is mirrored in the URL (`?tab=manage`) so creators can deep-
  // link straight to the Manage view from notifications. Source of
  // truth is the query string; the JSX reads via `activeTab` and we
  // navigate to switch.
  const activeTab: "general" | "manage" =
    searchParams?.get("tab") === "manage" ? "manage" : "general";
  // Selected user id for the submission-details modal in the Manage tab.
  // Null when the modal is closed.
  const [rosterUserId, setRosterUserId] = useState<string | null>(null);
  // Per-checkpoint draft state keyed by checkpoint id. Collapses what
  // used to be three parallel records (proofs / images / errors) into
  // a single object so every read and write updates the same slot.
  const [checkpointDrafts, setCheckpointDrafts] = useState<
    Record<string, CheckpointDraft>
  >({});
  // Pending checkpoint submissions for the creator — paginated via the
  // dedicated endpoint so the challenge-detail payload stays bounded.
  const [pendingSubmissions, setPendingSubmissions] = useState<
    PendingCheckpointSubmission[]
  >([]);
  const [pendingCursor, setPendingCursor] = useState<string | null>(null);
  const [loadingMorePending, setLoadingMorePending] = useState(false);
  // Creator-only: every checkpoint completion (across statuses) so the
  // per-user submission-details modal can show full step history for
  // checkpoint-mode challenges. Empty array on non-checkpoint or non-
  // creator pages — populated lazily by fetchAll below.
  const [allCheckpointCompletions, setAllCheckpointCompletions] = useState<
    ChallengeCheckpointCompletion[]
  >([]);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>(
    {}
  );
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [rewardStatus, setRewardStatus] = useState<string | null>(null);
  const [shareContext, setShareContext] = useState<ShareContext | null>(null);
  const [showCreatorJoinWarning, setShowCreatorJoinWarning] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Distribute-reward confirm modal: distinct state from showLeaveConfirm
  // because the actions, copy, and (most importantly) the destructive
  // semantics differ — paying out real Lightning sats deserves its own
  // gate, not a generic "are you sure".
  const [showRewardConfirm, setShowRewardConfirm] = useState(false);
  // Reject-completion confirm modal state. `rejectTargetId` doubles as
  // the open/closed flag (null = closed) and the id we'll send to the
  // verify endpoint when the creator clicks Reject. The reason draft
  // is required (the submit handler refuses to send an empty string).
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  const [zapLoadingId, setZapLoadingId] = useState<string | null>(null);
  const [zapInvoice, setZapInvoice] = useState<{ pr: string; sats: number } | null>(null);
  // Amount-picker modal state. Opens when the user taps the zap icon on
  // a submission card so they can choose how many sats to send before
  // we build the LNURL invoice — previously we silently used a 100-sat
  // default and jumped straight to the QR fallback.
  const [zapAmountTarget, setZapAmountTarget] = useState<CompletionItem | null>(null);
  const [zapAmountPreset, setZapAmountPreset] = useState<number>(100);
  const [zapAmountCustom, setZapAmountCustom] = useState<string>("");
  // Per-submitter lud16 lookup state. "loading" hides the zap CTA until
  // the kind:0 fetch resolves; "missing" disables it with a tooltip.
  // Keyed by Nostr pubkey so the same submitter is reused across entries.
  const [submitterLudStatus, setSubmitterLudStatus] = useState<
    Record<string, "loading" | "ok" | "missing">
  >({});
  // Reward-payout QR fallback. When the creator has no WebLN we render a
  // modal per-winner with the BOLT11 invoice and poll /api/zap/status until
  // it settles; on success we advance to the next winner, on user cancel we
  // abort the whole payout loop and roll back the ongoing Promise.
  const [rewardInvoice, setRewardInvoice] = useState<
    | { pr: string; sats: number; name: string; index: number; total: number }
    | null
  >(null);
  const rewardPayResolverRef = useRef<{
    resolve: () => void;
    reject: (err: Error) => void;
  } | null>(null);
  const rewardPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitterLnCache = useRef<Map<string, string | null>>(new Map());
  const { copied: invoiceCopied, copy: copyInvoice } = useClipboard();
  const { copied: rewardInvoiceCopied, copy: copyRewardInvoice } = useClipboard();

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
      const viewerIsCreator =
        !!sessionUser && cJson.success && cJson.data.creator_id === sessionUser.user_id;
      if (sessionUser && cJson.success) {
        setIsCreator(viewerIsCreator);
        // "Joined" means anything other than withdrawn — completed
        // participants of once-only / streak challenges keep their slot
        // in the roster and shouldn't see the join CTA again.
        setIsParticipant(
          partJson.success &&
            partJson.data.some(
              (p: ParticipantItem) =>
                p.user_id === sessionUser.user_id &&
                p.status !== "withdrawn"
            )
        );
      } else {
        setIsCreator(false);
        setIsParticipant(false);
      }

      // Creator-only: first page of pending checkpoint submissions
      // PLUS the all-statuses checkpoint completions feed used by the
      // submission-details modal. Both kept off the challenge-detail
      // payload so the primary response stays bounded.
      if (viewerIsCreator && cJson.success && cJson.data.checkpoint_mode !== "none") {
        try {
          const [pendingRes, allCpRes] = await Promise.all([
            fetch(
              `/api/challenges/${challengeId}/pending-checkpoint-submissions`
            ),
            fetch(`/api/challenges/${challengeId}/checkpoint-completions`),
          ]);
          const pendingJson = await pendingRes.json();
          if (pendingJson.success) {
            setPendingSubmissions(pendingJson.data.items);
            setPendingCursor(pendingJson.data.nextCursor);
          }
          const allCpJson = await allCpRes.json();
          if (allCpJson.success) {
            setAllCheckpointCompletions(allCpJson.data);
          }
        } catch {
          /* non-blocking — the review list just renders empty */
        }
      } else {
        setPendingSubmissions([]);
        setPendingCursor(null);
        setAllCheckpointCompletions([]);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [challengeId, sessionUser]);

  const loadMorePendingSubmissions = useCallback(async () => {
    if (!pendingCursor || loadingMorePending) return;
    setLoadingMorePending(true);
    try {
      const res = await fetch(
        `/api/challenges/${challengeId}/pending-checkpoint-submissions?cursor=${encodeURIComponent(pendingCursor)}`
      );
      const json = await res.json();
      if (json.success) {
        setPendingSubmissions((prev) => [...prev, ...json.data.items]);
        setPendingCursor(json.data.nextCursor);
      }
    } catch {
      /* ignore — user can retry */
    } finally {
      setLoadingMorePending(false);
    }
  }, [challengeId, pendingCursor, loadingMorePending]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Detect whether the signed-in user has an UNACCEPTED badge for this
  // challenge — i.e. the creator approved their proof and we wrote a
  // kind:8 award, but the user hasn't published the kind:30008 profile-
  // badges merge yet (which happens in my-challenges → Achievements).
  // We surface this with a banner on the challenge page so the user
  // doesn't have to navigate away to discover they've won something.
  //
  // Pulled into a stable callback (not inlined in the effect) so the
  // award + approval paths can re-run it explicitly after a new badge
  // could have been minted, without depending on `completions` and
  // refetching after every unrelated state change.
  const refreshPendingBadge = useCallback(async () => {
    if (!sessionUser) {
      setMyBadge(null);
      return;
    }
    try {
      const res = await fetch("/api/my-badges?limit=50");
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success) return;
      const items: AchievementItem[] = json.data?.items ?? [];
      const match = items.find((b) => b.challenge?.id === challengeId) ?? null;
      setMyBadge(match);
    } catch {
      /* non-blocking — banner just stays hidden */
    }
  }, [sessionUser, challengeId]);

  useEffect(() => {
    void refreshPendingBadge();
  }, [refreshPendingBadge]);

  // Click handler for the Join button. Creators joining their own
  // challenge see a warning modal first (they don't pay themselves if
  // they win); everyone else joins immediately.
  const handleJoinClick = () => {
    if (isCreator) {
      setShowCreatorJoinWarning(true);
      return;
    }
    void executeJoin();
  };

  const confirmCreatorJoin = () => {
    setShowCreatorJoinWarning(false);
    void executeJoin();
  };

  const executeJoin = async () => {
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("join");
    try {
      const res = await fetch(`/api/challenges/${challengeId}/join`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) {
        // Surface the API code (already_joined, challenge_completed, etc)
        // through the i18n layer; only fall back to the generic copy
        // when the server didn't emit a code we know how to translate.
        showToast(translateApiError(json, tErr, t("joinFailed")), "error");
        return;
      }
      if (challenge) {
        try {
          const signed = await signWithPrompt(
            buildJoinEvent(challenge.creator.nostr_pubkey, challenge.slug)
          );
          await publishSignedEvent(signed);
        } catch {
          /* non-blocking — DB row is already in place */
        }
      }
      await fetchAll();
      // Open the share modal only AFTER the join API confirmed success.
      // Previously the modal would pop on every click regardless of
      // whether the join actually went through, which made a 4xx feel
      // like a successful join.
      if (challenge) {
        setShareContext({
          kind: "challenge-joined",
          challenge: { id: challenge.id, title: challenge.title },
        });
      }
    } catch {
      showToast(t("joinFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Click handler for the "Joined ✓" toggle. Always opens the
  // leave-confirmation modal so users don't lose progress by accident.
  const handleWithdrawClick = () => {
    setShowLeaveConfirm(true);
  };

  const confirmLeave = () => {
    setShowLeaveConfirm(false);
    void executeWithdraw();
  };

  const executeWithdraw = async () => {
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("withdraw");
    try {
      const res = await fetch(`/api/challenges/${challengeId}/join`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) {
        showToast(translateApiError(json, tErr, t("withdrawFailed")), "error");
        return;
      }
      await fetchAll();
    } catch {
      showToast(t("withdrawFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitProof = async () => {
    if (!proofContent.trim() && !proofImageDescriptor) return;
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("proof");
    // Snapshot the form values so a successful submit can clear them
    // AFTER the relay publish step. Clearing too early loses the user's
    // text if the submit succeeds at the API but the publish step
    // throws — they'd have to retype everything to retry. We only
    // commit the clear once the API path returns ok.
    const submittedContent = proofContent;
    const submittedImage = proofImageDescriptor;
    // The textarea is the manual-proof surface — pick whichever
    // non-Nostr method the challenge advertises so the server doesn't
    // 400 on multi-method challenges (e.g. creator_approval +
    // nostr_hashtag). Schema enforces `automatic` is exclusive, so
    // when present it's the only option.
    const allowed = challenge?.verification_methods ?? [];
    const manualMethod = allowed.includes("automatic")
      ? "automatic"
      : "creator_approval";
    try {
      const res = await fetch(`/api/challenges/${challengeId}/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: manualMethod,
          content: submittedContent || null,
          image_url: submittedImage?.url ?? null,
        }),
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) {
        showToast(translateApiError(json, tErr, t("submitProofFailed")), "error");
        return;
      }
      // API committed the proof — safe to clear the draft and proceed.
      setProofContent("");
      setProofImageDescriptor(null);
      if (challenge) {
        try {
          const signed = await signWithPrompt(
            buildCompletionEvent({
              creatorPubkey: challenge.creator.nostr_pubkey,
              challengeSlug: challenge.slug,
              content: submittedContent,
              imageDescriptor: submittedImage ?? undefined,
            })
          );
          await publishSignedEvent(signed);
        } catch {
          /* non-blocking — DB row is already in place */
        }
      }
      // Creator participating in their own challenge: `decideAutoApprove`
      // lets them auto-complete (no one else can judge them), but the
      // badge-award flow AND the kind:30008 acceptance are normally
      // gated behind two separate manual gestures. Bundle both into
      // one shot so the creator gets the full NIP-58 round-trip from
      // the same submit click.
      if (json.data?.status === "approved") {
        await awardAndAcceptOwnBadge();
      }
      await fetchAll();
      showToast(t("submitProofSuccess"), "success");
      if (challenge) {
        setShareContext({
          kind: "challenge-completed",
          challenge: { id: challenge.id, title: challenge.title },
        });
      }
    } catch {
      showToast(t("submitProofFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Resolve the completion submitter's Lightning address from their NIP-01
  // kind 0 metadata (lud16). Cached per-pubkey for the lifetime of the page.
  const resolveSubmitterLightningAddress = async (
    pubkey: string
  ): Promise<string | null> => {
    const cached = submitterLnCache.current.get(pubkey);
    if (cached !== undefined) return cached;
    const metadata = await fetchNostrMetadata(pubkey);
    const address = metadata?.lud16?.trim() || null;
    submitterLnCache.current.set(pubkey, address);
    return address;
  };

  // Prefetch lud16 for the submitter whose submissions are open in the
  // modal so the per-entry Zap button can render disabled with a tooltip
  // when they have no Lightning address — instead of letting the user
  // click and be told no via toast.
  useEffect(() => {
    if (!rosterUserId) return;
    const pubkeys = Array.from(
      new Set(
        completions
          .filter(
            (c) =>
              c.user.id === rosterUserId &&
              c.user.nostr_pubkey &&
              c.user.nostr_pubkey !== sessionUser?.nostr_pubkey
          )
          .map((c) => c.user.nostr_pubkey as string)
      )
    );
    if (pubkeys.length === 0) return;

    let cancelled = false;
    pubkeys.forEach(async (pk) => {
      const cached = submitterLnCache.current.get(pk);
      if (cached !== undefined) {
        const next = cached ? "ok" : "missing";
        setSubmitterLudStatus((s) => (s[pk] === next ? s : { ...s, [pk]: next }));
        return;
      }
      setSubmitterLudStatus((s) => (s[pk] ? s : { ...s, [pk]: "loading" }));
      // Treat any relay/network error as "missing" so the button shows
      // the no-Lightning-address tooltip instead of staying stuck in
      // the loading state forever.
      let address: string | null = null;
      try {
        address = await resolveSubmitterLightningAddress(pk);
      } catch {
        address = null;
      }
      if (cancelled) return;
      setSubmitterLudStatus((s) => ({ ...s, [pk]: address ? "ok" : "missing" }));
    });
    return () => {
      cancelled = true;
    };
  }, [rosterUserId, completions, sessionUser?.nostr_pubkey]);

  const openZapAmountPicker = (comp: CompletionItem) => {
    if (!comp.user.nostr_pubkey) return;
    if (sessionUser?.nostr_pubkey === comp.user.nostr_pubkey) return;
    setZapAmountTarget(comp);
    setZapAmountPreset(100);
    setZapAmountCustom("");
  };

  const closeZapAmountPicker = () => {
    setZapAmountTarget(null);
    setZapAmountCustom("");
  };

  const handleZapCompletion = async (comp: CompletionItem, requestedSats: number) => {
    const submitterPubkey = comp.user.nostr_pubkey;
    if (!submitterPubkey) return;
    // Guard: never zap yourself. The button is hidden in this case but
    // we re-check here in case state drifts.
    if (sessionUser?.nostr_pubkey === submitterPubkey) return;

    setZapLoadingId(comp.id);
    try {
      const address = await resolveSubmitterLightningAddress(submitterPubkey);
      if (!address) {
        showToast(t("zapNoAddress"), "error");
        return;
      }

      let endpoint: Awaited<ReturnType<typeof fetchLnurlPayEndpoint>>;
      try {
        endpoint = await fetchLnurlPayEndpoint(address);
      } catch {
        showToast(t("zapFailed"), "error");
        return;
      }
      const minSats = Math.max(1, Math.ceil(endpoint.minSendable / 1000));
      const amountSats = Math.max(minSats, requestedSats);

      let invoice: string;
      try {
        invoice = await fetchInvoice(endpoint.callback, amountSats);
      } catch {
        showToast(t("zapFailed"), "error");
        return;
      }

      // Standard WebLN flow — works with any provider (Alby, Mutiny, Joule,
      // etc.). If the user's Nostr extension doesn't bundle WebLN (e.g.
      // nos2x, nostr-wot), fall through to the QR + invoice modal so they
      // can pay with any external Lightning wallet.
      if (typeof window !== "undefined" && window.webln) {
        try {
          await window.webln.enable();
          await window.webln.sendPayment(invoice);
          showToast(t("zapSuccess"), "success");
          return;
        } catch {
          /* fall through to invoice modal */
        }
      }

      setZapInvoice({ pr: invoice, sats: amountSats });
    } finally {
      setZapLoadingId(null);
    }
  };

  const handleConfirmZapAmount = async () => {
    if (!zapAmountTarget) return;
    const parsedCustom = Number(zapAmountCustom);
    const chosenSats = zapAmountCustom && !isNaN(parsedCustom) && parsedCustom > 0
      ? Math.floor(parsedCustom)
      : zapAmountPreset;
    if (!chosenSats || chosenSats <= 0) return;
    const target = zapAmountTarget;
    closeZapAmountPicker();
    await handleZapCompletion(target, chosenSats);
  };

  const handleCopyZapInvoice = async () => {
    if (!zapInvoice) return;
    await copyInvoice(zapInvoice.pr);
  };

  const handleVerifyLike = async (
    method: "nostr_action" | "nostr_hashtag"
  ) => {
    setVerifyError(null);
    // Per-method loading sentinel so a multi-method challenge (which
    // renders both verify buttons side-by-side) only spins the button
    // the user actually clicked.
    setActionLoading(`verify_${method}`);
    try {
      const res = await fetch(`/api/challenges/${challengeId}/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const json = await res.json();
      if (!json.success) {
        setVerifyError(translateApiError(json, tErr, t("proofNotFound")));
      } else {
        // When `creator_approval` is also configured, the Nostr proof
        // verifies but the row lands `pending` for the creator to
        // review — surface that explicitly so the participant knows
        // why their progress didn't tick up.
        if (json.data?.status === "pending") {
          showToast(t("proofPendingReview"), "info");
        }
        // Creator participating in their own challenge: same one-step
        // issue+accept path as the manual textarea flow.
        if (json.data?.status === "approved") {
          await awardAndAcceptOwnBadge();
        }
        await fetchAll();
      }
    } catch {
      setVerifyError(t("proofNotFound"));
    } finally {
      setActionLoading(null);
    }
  };

  // Build + sign + publish the kind:30101 Challenge Result event for the
  // given winner list, then PUT the event id back to the challenge row.
  // Used from the post-payout path AND the standalone "Republish results"
  // button that shows up if the initial publish failed (relay flake, tab
  // closed before publish completed, etc). Throws on any failure so
  // callers can distinguish best-effort vs user-initiated semantics.
  const publishResultEvent = async (winners: RewardWinner[]) => {
    if (!challenge) throw new Error("challenge_not_loaded");

    const resultWinners: ChallengeResultWinner[] = winners.map((w, idx) => ({
      pubkey: w.nostr_pubkey,
      place: placeLabel(idx),
      amountSats: w.amount_sats,
    }));
    const winnerUserIds = new Set(winners.map((w) => w.user_id));
    const completerPubkeys = participants
      .filter(
        (p) =>
          p.status === "completed" &&
          !winnerUserIds.has(p.user_id) &&
          p.user.nostr_pubkey
      )
      .map((p) => p.user.nostr_pubkey as string);

    const totalSats = winners.reduce((sum, w) => sum + w.amount_sats, 0);
    const completionCount = participants.filter(
      (p) => p.status === "completed"
    ).length;

    const resultEvent = buildChallengeResultEvent({
      slug: challenge.slug,
      creatorPubkey: challenge.creator.nostr_pubkey,
      content: t("rewardResultContent", { title: challenge.title }),
      winners: resultWinners,
      completerPubkeys,
      stats: {
        participants: challenge.participant_count,
        completions: completionCount,
        totalSats,
      },
    });
    const signedResult = await signWithPrompt(resultEvent);
    await publishSignedEvent(signedResult);
    await fetch(`/api/challenges/${challengeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result_nostr_event_id: signedResult.id }),
    });
  };

  // Finish the current reward-invoice modal: clear the poll, close the
  // modal, and settle the outstanding Promise for the waiting for-loop.
  // `resolve` advances to the next winner; `reject` aborts the whole payout.
  const finishRewardPay = useCallback((mode: "resolved" | "cancelled") => {
    if (rewardPollRef.current) {
      clearInterval(rewardPollRef.current);
      rewardPollRef.current = null;
    }
    setRewardInvoice(null);
    const r = rewardPayResolverRef.current;
    rewardPayResolverRef.current = null;
    if (!r) return;
    if (mode === "resolved") {
      r.resolve();
    } else {
      r.reject(new Error("payout_cancelled"));
    }
  }, []);

  // Shared AbortController for every receipt subscription started by
  // `payWinner` during this component's lifetime. Aborting on unmount
  // closes any post-payment kind:9735 watchers immediately instead of
  // leaving them open for the full 10s timeout after the user
  // navigates away.
  const receiptAbortRef = useRef<AbortController | null>(null);

  // Clean up any pending poll / open receipt subscriptions if the
  // user navigates away mid-payout.
  useEffect(() => {
    return () => {
      if (rewardPollRef.current) clearInterval(rewardPollRef.current);
      receiptAbortRef.current?.abort();
    };
  }, []);

  // Pay a single winner: try WebLN first, fall back to a QR + invoice
  // modal that polls /api/zap/status until settlement. Resolves with
  // the kind:9735 receipt event id (when we managed to capture it from
  // relays) or `undefined` otherwise. Rejects with `payout_cancelled`
  // if the user dismisses the modal.
  const payWinner = async (
    winner: PayableWinner,
    index: number,
    total: number
  ): Promise<string | undefined> => {
    if (!challenge) throw new Error("challenge_not_loaded");
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

    // Preferred path: WebLN provider settles the invoice silently and we
    // advance immediately. If the extension rejects or isn't installed we
    // fall through to the QR modal so the creator can pay from any
    // external Lightning wallet.
    let paid = false;
    if (typeof window !== "undefined" && window.webln) {
      try {
        await window.webln.enable();
        await window.webln.sendPayment(invoice);
        paid = true;
      } catch {
        /* fall through to QR fallback */
      }
    }

    if (!paid) {
      // No WebLN — show the BOLT11 as a QR, poll /api/zap/status
      // (NWC-backed) until the invoice settles, then resolve so the
      // for-loop moves on. This can take minutes; we don't want the
      // receipt subscription below to time out while the user is
      // still scanning, so it starts AFTER this resolves.
      await new Promise<void>((resolve, reject) => {
        rewardPayResolverRef.current = { resolve, reject };
        setRewardInvoice({
          pr: invoice,
          sats: winner.amount_sats,
          name: winner.display_name,
          index,
          total,
        });

        rewardPollRef.current = setInterval(async () => {
          try {
            const res = await fetch("/api/zap/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invoice }),
            });
            if (!res.ok) return;
            const { paid: isPaid } = await res.json();
            if (isPaid) finishRewardPay("resolved");
          } catch {
            // Silently ignore polling errors — we'll try again next tick.
          }
        }, REWARD_POLL_INTERVAL_MS);
      });
    }

    // Payment confirmed. Now fish the kind:9735 receipt out of relays.
    // Running this AFTER settlement (not in parallel with it) is
    // correct per NIP-01 — relays retain events so a REQ with `since`
    // set to just before we signed the zap request returns the receipt
    // during the initial EOSE flush even though it already landed.
    // Timeboxed; the return value flows into the per-winner PATCH but
    // the payout loop doesn't fail if the receipt never shows up.
    // The signal aborts the subscription on component unmount so
    // navigating away doesn't leave sockets open for up to 10s.
    if (!receiptAbortRef.current) {
      receiptAbortRef.current = new AbortController();
    }
    const receiptId = await awaitZapReceipt({
      recipientPubkey: winner.nostr_pubkey,
      signedZapRequestId: signedZap.id,
      options: {
        since: signedZap.created_at - 5,
        signal: receiptAbortRef.current.signal,
      },
    });
    return receiptId ?? undefined;
  };

  // Modal trigger — does NOT pay anything yet, just opens the confirm
  // dialog. The actual payout starts when the user clicks "Pay winners"
  // inside the modal, which calls `handleClaimReward` directly.
  const requestClaimReward = () => {
    if (!challenge) return;
    setShowRewardConfirm(true);
  };

  const handleClaimReward = async () => {
    if (!challenge) return;
    setShowRewardConfirm(false);
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
        setRewardError(translateApiError(json, tErr, t("rewardError")));
        return;
      }
      const winners: RewardWinner[] = json.data.winners;
      // Creator entries come back with retained=true. They're included in
      // the winners list for the kind:30101 result event, but the creator
      // doesn't pay themselves — so we skip them in the zap queue and
      // surface how many sats they kept.
      const retainedTotal = winners
        .filter((w) => w.retained)
        .reduce((sum, w) => sum + w.amount_sats, 0);
      // The server guarantees every non-retained winner has a resolved
      // lightning address (it 400s otherwise), so this predicate never
      // drops a row in practice — it just narrows the type for the loop.
      const payable = winners.filter(
        (w): w is PayableWinner => !w.retained && w.lightning_address !== null
      );
      if (payable.length === 0) {
        setRewardStatus(t("rewardAllRetained"));
        // No zaps to send — every winner is the creator (retained). The
        // `all_winners_paid` flag still flips `rewards_paid_at` so the
        // UI swaps out of the "Distribute rewards" state.
        await fetch(`/api/challenges/${challengeId}/reward`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all_winners_paid: true }),
        });
        try {
          await publishResultEvent(winners);
        } catch {
          /* non-blocking */
        }
        await fetchAll();
        return;
      }

      // Per-winner counters used to surface "X of N paid" in the
      // status line — the loop reports finer-grained progress than
      // the QR modal alone, which only tells the user about the
      // current invoice.
      let paidCount = 0;
      let stampFailures = 0;
      setRewardStatus(t("rewardProgress", { paid: 0, total: payable.length }));
      for (let i = 0; i < payable.length; i++) {
        try {
          const receiptEventId = await payWinner(
            payable[i],
            i + 1,
            payable.length
          );
          paidCount += 1;
          setRewardStatus(
            t("rewardProgress", { paid: paidCount, total: payable.length })
          );
          // Per-winner PATCH right after the zap settles — server
          // stamps `participants.rewarded_at` so a mid-loop crash
          // leaves the paid row marked and a retried POST /reward
          // skips it. Receipt id is optional (WebLN usually doesn't
          // return one); when we manage to capture it via the
          // post-payment relay subscription we pass it through here.
          try {
            const stampRes = await fetch(
              `/api/challenges/${challengeId}/reward`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_id: payable[i].user_id,
                  ...(receiptEventId
                    ? { receipt_event_id: receiptEventId }
                    : {}),
                }),
              }
            );
            if (!stampRes.ok) {
              // Server didn't record the payment. The zap already
              // landed in the recipient's wallet — a retry is safe
              // because the POST /reward endpoint skips winners
              // whose participants.rewarded_at is set, but THIS row
              // wasn't stamped, so it WILL be re-offered. Surface a
              // single warning at the end of the loop.
              stampFailures += 1;
            }
          } catch {
            // Same rationale as the !ok branch above.
            stampFailures += 1;
          }
        } catch (err) {
          if (err instanceof Error && err.message === "payout_cancelled") {
            // Tell the creator how many winners actually got paid
            // before the cancel — the loop is idempotent on retry, so
            // the message also reassures them that re-running won't
            // double-pay anyone.
            setRewardError(
              t("rewardCancelledSummary", {
                paid: paidCount,
                total: payable.length,
              })
            );
            return;
          }
          throw err;
        }
      }

      if (stampFailures > 0) {
        // Non-fatal: the recipient already got the sats but the server
        // doesn't know it. We use setRewardStatus (not setRewardError)
        // because the user-facing outcome is still "rewards paid" —
        // just with a caveat about retry behavior.
        setRewardStatus(t("rewardStampWarning"));
      }

      // Explicit "all winners paid" signal — the server only stamps
      // `rewards_paid_at` when this flag is present, so a failed or
      // empty PATCH can never flip the challenge into the "paid" state.
      await fetch(`/api/challenges/${challengeId}/reward`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all_winners_paid: true }),
      });

      // Publish the Challenge Result event. Best-effort: a relay failure
      // shouldn't prevent us from showing the success state since the
      // payments already landed. If this fails we surface a
      // "Republish results" button on the next render so the creator can
      // retry without re-running the whole payout flow.
      try {
        await publishResultEvent(winners);
      } catch {
        /* non-blocking — recovery UI will handle it */
      }

      setRewardStatus(
        retainedTotal > 0
          ? `${t("rewardSent")} ${t("rewardRetainedByCreator", { amount: retainedTotal })}`
          : t("rewardSent")
      );
      await fetchAll();
    } catch (err) {
      // Never surface raw err.message — it can be English (network
      // errors, LNURL codes) and would render in the active locale's
      // UI as untranslated text. Log for debugging, show a translated
      // generic instead.
      console.error("Reward payout failed:", err);
      setRewardError(t("rewardError"));
    } finally {
      setActionLoading(null);
    }
  };

  // Recovery path: rewards already paid but the kind:30101 publish never
  // landed (relay flake, tab closed between PATCH and publish, signer
  // rejected mid-flow, …). Re-derives the winner list from the idempotent
  // POST /reward endpoint and runs the publish step again.
  const handleRepublishResult = async () => {
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
    setActionLoading("republishResult");
    try {
      const res = await fetch(`/api/challenges/${challengeId}/reward`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.success) {
        setRewardError(translateApiError(json, tErr, t("republishResultFailed")));
        return;
      }
      const winners: RewardWinner[] = json.data.winners;
      await publishResultEvent(winners);
      setRewardStatus(t("republishResultSuccess"));
      await fetchAll();
    } catch {
      setRewardError(t("republishResultFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  // Recovery path: challenge has a prize but no `zap_goal_event_id`
  // on file. Covers two cases: creation-time publish failed (relay
  // flake, signer rejected) and legacy challenges from before we made
  // zap-goal publishing mandatory. Idempotent — re-publishing produces
  // a new kind 9041 event; we simply overwrite the id on the DB row.
  const handleRepublishZapGoal = async () => {
    if (!challenge) return;
    if (challenge.prize_amount_sats <= 0) return;
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setActionLoading("republishZapGoal");
    try {
      const unsigned = buildZapGoalEvent({
        challengeSlug: challenge.slug,
        creatorPubkey: challenge.creator.nostr_pubkey,
        amountSats: challenge.prize_amount_sats,
        title: `Prize pot: ${challenge.title}`,
        relays: DEFAULT_RELAYS,
        closedAt: challenge.ends_at ?? undefined,
      });
      const signed = await signWithPrompt(unsigned);
      await publishSignedEvent(signed);
      await fetch(`/api/challenges/${challengeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zap_goal_event_id: signed.id }),
      });
      await fetchAll();
    } catch {
      /* surfaced as the panel's error hint on next render */
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteCheckpoint = async (
    checkpoint: Checkpoint,
    method: VerificationMethod
  ) => {
    // Clear any previous error on this checkpoint draft before retrying.
    updateCheckpointDraft(setCheckpointDrafts, checkpoint.id, { error: null });
    setActionLoading(`cp_${checkpoint.id}`);
    try {
      const body: Record<string, unknown> = { method };
      const needsContent = method !== "nostr_action" && method !== "nostr_hashtag";
      if (needsContent) {
        const content = (checkpointDrafts[checkpoint.id]?.proof ?? "").trim();
        const image = checkpointDrafts[checkpoint.id]?.image ?? null;
        if (!content && !image) {
          updateCheckpointDraft(setCheckpointDrafts, checkpoint.id, {
            error: t("checkpointProofRequired"),
          });
          return;
        }
        if (content && content.length < 5) {
          updateCheckpointDraft(setCheckpointDrafts, checkpoint.id, {
            error: t("proofTooShort"),
          });
          return;
        }
        if (content) body.content = content;
        if (image) body.image_url = image.url;
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
        updateCheckpointDraft(setCheckpointDrafts, checkpoint.id, {
          error: translateApiError(json, tErr, t("checkpointError")),
        });
        return;
      }
      // Mirror the challenge-level toast: when `creator_approval` is
      // also configured on the checkpoint, the Nostr proof verifies but
      // the row lands `pending` for the creator to review. Surface that
      // explicitly so the participant knows their progress hasn't ticked
      // up yet.
      if (json.data?.status === "pending") {
        showToast(t("proofPendingReview"), "info");
      }
      // Snapshot the submitted content + image before the clears below
      // so the Nostr publish below has the real proof to sign.
      const submittedContent = (
        checkpointDrafts[checkpoint.id]?.proof ?? ""
      ).trim();
      const submittedImage = checkpointDrafts[checkpoint.id]?.image ?? null;

      setCheckpointDrafts((prev) => {
        const next = { ...prev };
        delete next[checkpoint.id];
        return next;
      });

      // Publish a Nostr note mirroring the submission, matching what
      // handleSubmitProof does for challenge-level completions. Uses
      // kind 7101 with a `step` + `checkpoint` tag so off-Arena
      // clients render something meaningful. Fire-and-forget: the API
      // insert is the authoritative source of truth.
      if (needsContent && challenge) {
        const checkpointOrder =
          challenge.checkpoints.findIndex((c) => c.id === checkpoint.id) + 1;
        if (checkpointOrder > 0) {
          try {
            const signed = await signWithPrompt(
              buildCheckpointCompletionEvent({
                creatorPubkey: challenge.creator.nostr_pubkey,
                challengeSlug: challenge.slug,
                checkpointOrder,
                checkpointTitle: checkpoint.title,
                content: submittedContent,
                imageDescriptor: submittedImage ?? undefined,
              })
            );
            await publishSignedEvent(signed);
          } catch {
            /* non-blocking — submission already persisted in the API */
          }
        }
      }

      await fetchAll();
    } catch {
      updateCheckpointDraft(setCheckpointDrafts, checkpoint.id, {
        error: t("checkpointError"),
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Reject-with-reason flow: the inline button no longer fires the
  // verify API directly. It opens a confirm modal with a textarea so
  // the submitter sees a useful note instead of a silent rejection.
  // Approvals stay direct — there's nothing for the creator to write.
  const handleApprove = (completionId: string) =>
    runVerify(completionId, "approved", null);

  const handleReject = (completionId: string) => {
    setRejectTargetId(completionId);
    setRejectReasonDraft("");
  };

  const confirmRejectCompletion = async () => {
    const targetId = rejectTargetId;
    if (!targetId) return;
    const reason = rejectReasonDraft.trim();
    if (!reason) {
      showToast(t("rejectReasonRequired"), "error");
      return;
    }
    setRejectTargetId(null);
    setRejectReasonDraft("");
    await runVerify(targetId, "rejected", reason);
  };

  const runVerify = async (
    completionId: string,
    status: "approved" | "rejected",
    rejectReason: string | null
  ) => {
    setActionLoading(completionId);
    try {
      const res = await fetch(`/api/completions/${completionId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(status === "rejected" && rejectReason
            ? { reject_reason: rejectReason }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) {
        showToast(translateApiError(json, tErr, t("verifyError")), "error");
        return;
      }
      // Prize-less challenges (no badge name and no badge image) have
      // nothing to publish on Nostr after approval — the "enviando
      // badge…" toast and the awardBadgeToUser() call both lied about
      // what was happening. Use the badge-aware toast and skip the
      // award path when the challenge has no badge to send.
      const challengeHasBadge = !!(
        challenge?.badge_name || challenge?.badge_image_url
      );
      showToast(
        status === "approved"
          ? challengeHasBadge
            ? t("verifyApprovedToast")
            : t("verifyApprovedNoBadgeToast")
          : t("verifyRejectedToast"),
        status === "approved" ? "success" : "info"
      );
      if (status === "approved" && challengeHasBadge) {
        // Approving the proof IS the badge-award gesture — there's no
        // separate creator action anymore. Look up the completion's user
        // from the in-memory list and run the same award + publish path
        // that the multi-select button used to drive.
        const comp = completions.find((c) => c.id === completionId);
        if (comp) await awardBadgeToUser(comp.user.id);
      }
      await fetchAll();
    } catch {
      showToast(t("verifyError"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Publish the NIP-58 kind:30008 acceptance for the signed-in user's
  // badge on this challenge — same flow as the manual "Accept" button
  // in /my-challenges → Achievements, inlined here so the creator-as-
  // participant path can do issue + accept in a single gesture.
  const acceptOwnBadge = async (badge: AchievementItem) => {
    if (!badge.challenge.badge_nostr_event_id || !badge.nostr_event_id) {
      // The kind:30009 / kind:8 publish step didn't complete (relay
      // flake, signer cancel). Nothing to merge into kind:30008 yet.
      return;
    }
    if (!sessionUser?.nostr_pubkey) return;
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    try {
      const definitionATag = `30009:${badge.issuer.nostr_pubkey}:${badge.challenge.slug}`;
      const newPair = {
        definitionATag,
        awardEventId: badge.nostr_event_id,
      };
      const latest = await fetchLatestEventOfKind(
        sessionUser.nostr_pubkey,
        30008
      ).catch(() => null);
      const existing = latest ? parseProfileBadgesPairs(latest) : [];
      const deduped = existing.filter(
        (p) => p.awardEventId !== newPair.awardEventId
      );
      const merged = [...deduped, newPair];
      const event = buildProfileBadgesEvent(merged);
      const signed = await signWithPrompt(event);
      await publishSignedEvent(signed);
      await fetch(`/api/badges/${badge.id}`, { method: "PATCH" }).catch(
        () => null
      );
      await refreshPendingBadge();
    } catch {
      /* non-blocking — banner will still nudge them to /my-challenges */
    }
  };

  // Creator-as-participant one-step issuance. When the creator
  // completes their own challenge `decideAutoApprove` skips the manual
  // review path, so the kind:8 award AND the kind:30008 acceptance both
  // go missing. We catch that here by chaining `awardBadgeToUser` (DB
  // row + kind:30009 def + kind:8) and `acceptOwnBadge` (kind:30008
  // merge) into a single click — the creator never has to leave the
  // page to claim what they earned. Both halves are idempotent (the
  // award API returns 409 on duplicate, the accept merge dedupes by
  // event id) so calling this twice is safe.
  const awardAndAcceptOwnBadge = async () => {
    if (!sessionUser || !challenge) return;
    if (challenge.creator_id !== sessionUser.user_id) return;
    if (!isParticipant) return;
    if (!challenge.badge_name && !challenge.badge_image_url) return;
    const hasApproved = completions.some(
      (c) => c.user.id === sessionUser.user_id && c.status === "approved"
    );
    if (!hasApproved) return;
    await awardBadgeToUser(sessionUser.user_id);
    // awardBadgeToUser fires `refreshPendingBadge` without awaiting, so
    // reading `myBadge` here would lag the network. Re-fetch directly
    // to pick up the row we just created (or the pre-existing one in
    // the recovery case) plus its now-populated nostr_event_id.
    const res = await fetch("/api/my-badges?limit=50").catch(() => null);
    if (!res || !res.ok) return;
    const json = await res.json().catch(() => null);
    if (!json?.success) return;
    const items: AchievementItem[] = json.data?.items ?? [];
    const fresh = items.find((b) => b.challenge?.id === challengeId);
    if (!fresh || fresh.accepted_at) return;
    await acceptOwnBadge(fresh);
  };

  // Award + publish the NIP-58 badge for a single recipient. Idempotent
  // on the server (409 if a badge row already exists), so we treat that
  // case as success — the user already has the badge.
  const awardBadgeToUser = async (userId: string) => {
    if (!challenge) return;
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    const winner = participants.find((p) => p.user_id === userId);
    if (!winner?.user.nostr_pubkey) {
      // The DB row for this badge can still be created (we already
      // approved the proof), but without a Nostr pubkey we have no
      // recipient to publish kind:8 to. Surface a toast instead of
      // failing silently — otherwise the creator clicks Approve and
      // sees absolutely nothing happen.
      showToast(t("badgeAwardMissingPubkey"), "error");
      return;
    }

    const awardRes = await fetch(`/api/challenges/${challengeId}/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: [userId] }),
    });
    // 409 = already awarded; that's a no-op success for our purposes.
    if (!awardRes.ok && awardRes.status !== 409) {
      showToast(t("badgeAwardFailed"), "error");
      return;
    }

    try {
      // NIP-58 needs the kind:30009 definition before we can `a`-tag it
      // from a kind:8 award. Lazy-publish on first use so legacy
      // challenges from before the definition was mandatory still work.
      if (!challenge.badge_nostr_event_id) {
        const definition = buildBadgeDefinitionEvent({
          slug: challenge.slug,
          name: challenge.badge_name || challenge.title,
          description: undefined,
          image: challenge.badge_image_url || undefined,
        });
        const signedDef = await signWithPrompt(definition);
        await publishSignedEvent(signedDef);
        await fetch(`/api/challenges/${challengeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ badge_nostr_event_id: signedDef.id }),
        });
      }

      const signed = await signWithPrompt(
        buildBadgeAwardEvent({
          badgeDefinitionSlug: challenge.slug,
          issuerPubkey: challenge.creator.nostr_pubkey,
          recipientPubkey: winner.user.nostr_pubkey,
        })
      );
      await publishSignedEvent(signed);
      fetch(`/api/challenges/${challengeId}/award`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          nostr_event_id: signed.id,
        }),
      }).catch(() => {});
      showToast(t("badgeAwardSent"), "success");
      // The recipient of the award (when they're the signed-in user)
      // should see the awardee banner without having to refresh the
      // page. Inexpensive — one /api/my-badges call instead of one
      // per completions update.
      void refreshPendingBadge();
    } catch {
      // DB row is already in place — let the creator know publishing failed
      // so they can retry from the participant list.
      showToast(t("badgeAwardFailed"), "error");
    }
  };

  const handleVerifyCheckpoint = async (
    submissionId: string,
    status: "approved" | "rejected"
  ) => {
    setActionLoading(`cpv_${submissionId}`);
    try {
      const body: Record<string, unknown> = { status };
      // Only send reject_reason on rejections; the server ignores it
      // on approval but we don't need to round-trip useless bytes.
      if (status === "rejected") {
        const reason = (rejectReasons[submissionId] ?? "").trim();
        if (reason) body.reject_reason = reason;
      }
      const res = await fetch(
        `/api/checkpoint-completions/${submissionId}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) {
        showToast(
          translateApiError(json, tErr, t("checkpointReviewError")),
          "error"
        );
        return;
      }
      // Drop the per-submission reject-reason input — the row is
      // leaving the pending list so the textarea is about to unmount.
      setRejectReasons((prev) => {
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
      await fetchAll();
    } catch {
      showToast(t("checkpointReviewError"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <BlockLoader label={tCommon("loading")} />
      </div>
    );
  }

  if (!challenge) {
    notFound();
  }

  // Derived once per render — both tabs read it: General lists badge
  // recipients next to participants, Manage shows the same data in the
  // detailed list. Built from completions so the rule stays aligned with
  // "approved completion === badge".
  const badgeRecipientUserIds = new Set(
    completions
      .filter((c) => c.status === "approved")
      .map((c) => c.user.id)
  );

  // Per-viewer derivations — precomputed once so the JSX below reads
  // straight from these values instead of re-running the same filters
  // inside multiple inline IIFEs.
  const myProgressInfo = deriveMyProgress(
    challenge,
    participants,
    completions,
    sessionUser?.user_id ?? null
  );
  const manageRoster = deriveManageRoster(
    participants,
    completions,
    allCheckpointCompletions,
    challenge
  );

  // Belt-and-braces: if a non-creator manages to flip activeTab to
  // "manage" via stale state (e.g. they were the creator a moment ago,
  // then the session changed), force-fall back to general so the page
  // never tries to render the creator-only surfaces for the wrong viewer.
  const showManage = activeTab === "manage" && isCreator;

  // One-step badge recovery for the creator-as-participant case.
  // Renders when the creator joined their own challenge, completed it
  // (approved row exists), the challenge has a badge to issue, and they
  // either have no badge row yet (pre-self-award fix) OR have a row they
  // never accepted on Nostr. The button bundles award + acceptance into
  // a single click.
  const challengeHasBadge = !!(
    challenge.badge_name || challenge.badge_image_url
  );
  const myApprovedCompletion = !!sessionUser && completions.some(
    (c) => c.user.id === sessionUser.user_id && c.status === "approved"
  );
  const showSelfBadgeRecovery =
    isCreator &&
    isParticipant &&
    challengeHasBadge &&
    myApprovedCompletion &&
    (!myBadge || !myBadge.accepted_at);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        {showManage ? (
          <button
            className={styles.backButton}
            onClick={() => router.push(`/explore/${challengeId}`)}
          >
            <ArrowRightIcon size={16} /> {t("backToChallenge")}
          </button>
        ) : (
          <button
            className={styles.backButton}
            onClick={() => router.push("/explore")}
          >
            <ArrowRightIcon size={16} /> {tCommon("back")}
          </button>
        )}
        {isCreator && !showManage && (
          // Top-right CTA replaces the previous tab nav. Lives in the
          // URL (`?tab=manage`) so creators can deep-link from a
          // notification — push() instead of replace() so back/forward
          // works as expected.
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push(`/explore/${challengeId}?tab=manage`)}
          >
            {t("manageChallengeCta")}
          </Button>
        )}
      </div>

      <div className={styles.main}>

        {/*
          Banner shown when the signed-in user has earned a badge for
          THIS challenge but hasn't accepted it yet. Without this nudge
          a freshly-approved participant has no idea they need to do
          one more click to publish kind:30008 and have the badge show
          up in other Nostr clients. Hidden once the user accepts (the
          /api/my-badges row gets `accepted_at` and the next refetch
          drops it from the unaccepted list).
        */}
        {showSelfBadgeRecovery ? (
          // Creator-as-participant one-step recovery. Replaces the
          // generic pending-badge banner because the creator IS the
          // issuer — punting them to /my-challenges to "Accept" their
          // own badge would just split a single intent across two
          // pages. Clicking the button runs award (idempotent) +
          // accept in one shot.
          <div className={styles.badgeBanner} role="status">
            <BoltIcon size={18} color="var(--color-secondary)" />
            <div className={styles.badgeBannerBody}>
              <strong>{t("creatorClaimBadge")}</strong>
              <span>{t("creatorClaimBadgeBody")}</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={actionLoading === "self-badge"}
              onClick={async () => {
                setActionLoading("self-badge");
                try {
                  await awardAndAcceptOwnBadge();
                } finally {
                  setActionLoading(null);
                }
              }}
            >
              {actionLoading === "self-badge"
                ? t("creatorClaimBadgePending")
                : t("creatorClaimBadgeCta")}
            </Button>
          </div>
        ) : (
          hasPendingBadge && (
            <div className={styles.badgeBanner} role="status">
              <BoltIcon size={18} color="var(--color-secondary)" />
              <div className={styles.badgeBannerBody}>
                <strong>{t("youEarnedBadge")}</strong>
                <span>{t("youEarnedBadgeBody")}</span>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push("/my-challenges?tab=achievements")}
              >
                {t("youEarnedBadgeCta")}
              </Button>
            </div>
          )
        )}

        {!showManage && (
          <div className={styles.grid}>
            <div className={styles.col}>
              <Section>
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
                    <span>
                      {(challenge.verification_methods ?? [])
                        .map((m) => tCreate(`verificationTypes.${m}`))
                        .join(" · ")}
                    </span>
                  </div>
                  {/* Nostr-targeted challenges expose the link in the
                      info block so non-participants can also see what
                      the challenge is about. nostr_action points at a
                      specific event and goes through njump (njump.me
                      only routes NIP-19 entities). nostr_hashtag has
                      no single target — we send those to nostr.band's
                      hashtag search instead, since njump has no
                      `/t/<tag>` route. */}
                  {challenge.nostr_action_target_event_id && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>
                        {t("nostrTargetLabel")}
                      </span>
                      <a
                        href={`https://njump.me/${challenge.nostr_action_target_event_id}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {t("viewOnNostr")}
                      </a>
                    </div>
                  )}
                  {challenge.nostr_hashtag && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>
                        {t("nostrHashtagLabel")}
                      </span>
                      <a
                        href={`https://nostr.band/?q=${encodeURIComponent(`#${challenge.nostr_hashtag}`)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        #{challenge.nostr_hashtag}
                      </a>
                    </div>
                  )}
                  {challenge.ends_at && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>{t("ends")}</span>
                      <span>{new Date(challenge.ends_at).toLocaleDateString(locale)}</span>
                    </div>
                  )}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>{t("participants")}</span>
                    <span>{challenge.participant_count}</span>
                  </div>
                </div>

                <SignerRequiredNotice />

                {/* Card-body action: only the "leave" affordance for
                    already-joined participants. The join CTA lives in
                    the right column ("¿Querés sumarte?") so we don't
                    render it twice on the same screen. */}
                {(challenge.status === "open" ||
                  challenge.status === "in_progress") &&
                  isParticipant && (
                    <Button
                      variant="outline"
                      onClick={handleWithdrawClick}
                      disabled={actionLoading === "withdraw"}
                    >
                      {actionLoading === "withdraw"
                        ? t("leaving")
                        : t("joinedToggle")}
                    </Button>
                  )}
                {isCreator && (
                  <p className={styles.creatorBadge}>{t("yourChallenge")}</p>
                )}
              </Section>

              {(!!challenge.badge_image_url ||
                !!challenge.badge_name ||
                challenge.prize_amount_sats > 0) && (
                <Section>
                  <SectionTitle>{t("rewardDisplayTitle")}</SectionTitle>
                  <div className={styles.rewardBlock}>
                    {(challenge.badge_image_url || challenge.badge_name) && (
                      <div className={styles.rewardBadgeBlock}>
                        {challenge.badge_image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={challenge.badge_image_url}
                            alt={challenge.badge_name ?? tCommon("badge")}
                            className={styles.rewardBadgeImage}
                            width={64}
                            height={64}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div
                            className={styles.rewardBadgePlaceholder}
                            aria-hidden="true"
                          />
                        )}
                        <div className={styles.rewardBadgeText}>
                          <span className={styles.rewardItemLabel}>
                            {t("badgeAwarded")}
                          </span>
                          {challenge.badge_name && (
                            <span className={styles.rewardBadgeName}>
                              {challenge.badge_name}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {challenge.prize_amount_sats > 0 && (
                      <div className={styles.rewardPrizeBlock}>
                        <BoltIcon size={20} />
                        <div className={styles.rewardBadgeText}>
                          <span className={styles.rewardItemLabel}>
                            {t("prizePool")}
                          </span>
                          <span className={styles.rewardPrizeAmount}>
                            {challenge.prize_amount_sats.toLocaleString(locale)}{" "}
                            {tCommon("sats")}
                          </span>
                          {challenge.prize_distribution &&
                            challenge.prize_distribution !== "none" && (
                              <span className={styles.rewardPrizeMode}>
                                {tCreate(
                                  `rewardZapModes.${challenge.prize_distribution}`
                                )}
                              </span>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              )}

            </div>

            <div className={styles.col}>
              {/* Zap goal funding bar lives at the top of the right
                  column so the "Fund this pot" CTA reads as the
                  primary call to action for visitors who haven't
                  joined yet. Hidden when the challenge has no prize. */}
              {challenge.prize_amount_sats > 0 && (
                <ZapGoalProgress
                  goalEventId={challenge.zap_goal_event_id}
                  goalSats={challenge.prize_amount_sats}
                  challengeTitle={challenge.title}
                  creatorPubkey={challenge.creator.nostr_pubkey}
                  creatorLightningAddress={
                    challenge.creator.lightning_address ?? null
                  }
                  rewardsPaid={!!challenge.rewards_paid_at}
                  creatorCanRepublish={isCreator && !challenge.zap_goal_event_id}
                  onRepublish={handleRepublishZapGoal}
                  republishLoading={actionLoading === "republishZapGoal"}
                />
              )}
              {isParticipant ? (
                <>
                  <CheckpointCompletionSection
                    checkpointMode={challenge.checkpoint_mode}
                    checkpoints={challenge.checkpoints}
                    myCheckpointCompletions={challenge.my_checkpoint_completions}
                    isParticipant={isParticipant}
                    drafts={checkpointDrafts}
                    onDraftChange={(checkpointId, patch) =>
                      updateCheckpointDraft(setCheckpointDrafts, checkpointId, patch)
                    }
                    onSubmitCheckpoint={handleCompleteCheckpoint}
                    submittingCheckpointId={
                      actionLoading?.startsWith("cp_") ? actionLoading.slice(3) : null
                    }
                  />

                  {/* Per-participant progress + own-submission history.
                      Only relevant for streak/multi-submission challenges
                      (checkpoint_mode === "none") — when checkpoints are
                      enabled, CheckpointCompletionSection above already
                      shows per-step progress and per-step history. */}
                  {challenge.checkpoint_mode === "none" && (
                    <Section>
                      <SectionTitle>{t("yourProgressTitle")}</SectionTitle>
                      <div className={styles.progressLayout}>
                        {/* Skip the bare progress count for one-shot
                            challenges (no goal AND no unit) — rendering a
                            lone "1" above the completion banner adds
                            visual noise without communicating anything
                            the banner doesn't already say. */}
                        {myProgressInfo.goal ? (
                          <div className={styles.progressTrack}>
                            <div className={styles.progressBar}>
                              <div
                                className={styles.progressFill}
                                style={{ width: `${myProgressInfo.pct ?? 0}%` }}
                              />
                            </div>
                            <span className={styles.progressCount}>
                              {t("yourProgressCount", {
                                progress: myProgressInfo.myProgress,
                                goal: myProgressInfo.goal,
                              })}
                            </span>
                          </div>
                        ) : challenge.unit ? (
                          <span className={styles.progressCount}>
                            {t("yourProgressUncapped", {
                              progress: myProgressInfo.myProgress,
                              unit: challenge.unit,
                            })}
                          </span>
                        ) : null}
                        {myProgressInfo.completed && (
                          <p className={styles.completedBanner}>
                            {t("challengeCompleted")}
                          </p>
                        )}
                        {myProgressInfo.myCompletions.length === 0 ? (
                          // Migrated from the ad-hoc <p className=
                          // {styles.emptyText}> to the shared
                          // EmptyState primitive so this surface
                          // matches the rest of the audit pass and
                          // can carry a description line.
                          <EmptyState
                            title={t("noMySubmissions")}
                            description={t("noMySubmissionsBody")}
                            className={styles.inlineEmpty}
                          />
                        ) : (
                          <div className={styles.mySubmissionsBlock}>
                            <h3 className={styles.mySubmissionsTitle}>
                              {t("mySubmissionsTitle")}
                            </h3>
                            <div className={styles.mySubmissionList}>
                              {[...myProgressInfo.myCompletions]
                                .reverse()
                                .map((c) => (
                                  // Whole row is a button so participants
                                  // can re-open their own submission in the
                                  // same modal the Pruebas avatars use,
                                  // without having to dig into Manage.
                                  <button
                                    key={c.id}
                                    type="button"
                                    className={styles.mySubmissionRow}
                                    onClick={() =>
                                      sessionUser &&
                                      setRosterUserId(sessionUser.user_id)
                                    }
                                    aria-label={`${tCommon(c.status)} — ${
                                      c.content || t("proofImageAlt")
                                    }`}
                                  >
                                    <span className={styles.mySubmissionDate}>
                                      {new Date(
                                        c.submitted_at
                                      ).toLocaleDateString(locale)}
                                    </span>
                                    <span
                                      className={styles.mySubmissionContent}
                                      title={c.content ?? ""}
                                    >
                                      {c.content ||
                                        (c.image_url
                                          ? t("proofImageAlt")
                                          : "—")}
                                    </span>
                                    <Tag
                                      variant={
                                        c.status === "approved"
                                          ? "green"
                                          : c.status === "rejected"
                                            ? "red"
                                            : "gold"
                                      }
                                    >
                                      {tCommon(c.status)}
                                    </Tag>
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Section>
                  )}

                  {myProgressInfo.canSubmitMore && (
                    <NostrVerifySection
                      challenge={challenge}
                      actionLoading={actionLoading}
                      verifyError={verifyError}
                      onVerify={handleVerifyLike}
                      onClearError={() => setVerifyError(null)}
                    />
                  )}

                  {/* Hide the next-proof input once the participant has
                      hit the goal — they're done. `canSubmitMore` also
                      covers one-shot challenges with a pending Nostr
                      proof so the form doesn't keep inviting
                      submissions that can't move the needle. */}
                  {challenge.checkpoint_mode === "none" &&
                    (challenge.verification_methods ?? []).some(
                      (m) => m !== "nostr_action" && m !== "nostr_hashtag"
                    ) &&
                    myProgressInfo.canSubmitMore && (
                      <Section>
                        <SectionTitle>
                          {myProgressInfo.myCompletions.length === 0
                            ? t("submitFirstProof")
                            : t("submitNextProof")}
                        </SectionTitle>
                        <textarea
                          className={styles.proofInput}
                          placeholder={t("proofPlaceholder")}
                          value={proofContent}
                          onChange={(e) => setProofContent(e.target.value)}
                          rows={3}
                        />
                        <div className={styles.proofActions}>
                          <div className={styles.proofActionsUpload}>
                            <ImageUpload
                              value={proofImageDescriptor}
                              onChange={setProofImageDescriptor}
                              alt={t("proofImageAlt")}
                              maxSizeMB={5}
                            />
                          </div>
                          <Button
                            className={styles.proofSubmitButton}
                            size="sm"
                            onClick={handleSubmitProof}
                            disabled={
                              (!proofContent.trim() && !proofImageDescriptor) ||
                              actionLoading === "proof"
                            }
                          >
                            {actionLoading === "proof" ? t("submitting") : tCommon("submit")}
                          </Button>
                        </div>
                      </Section>
                    )}
                </>
              ) : (
                (challenge.status === "open" || challenge.status === "in_progress") && (
                  <div className={styles.joinPrompt}>
                    <p className={styles.joinPromptTitle}>
                      {t("joinPromptTitle")}
                    </p>
                    <p className={styles.joinPromptBody}>
                      {t("joinPromptBody")}
                    </p>
                    <Button onClick={handleJoinClick} disabled={actionLoading === "join"}>
                      {actionLoading === "join" ? t("joining") : t("joinChallenge")}
                    </Button>
                  </div>
                )
              )}

              {/* Compact completions — only render when someone has
                  actually submitted. An empty completions section adds
                  visual weight without communicating anything; the
                  count badge already lives next to participants once
                  the first proof comes in. */}
              {completions.length > 0 && (
                <Section>
                  <SectionTitle>
                    {t("completions")} ({completions.length})
                  </SectionTitle>
                  {/* Status breakdown so a viewer can tell at a glance
                      how many proofs are still waiting on the creator
                      vs already verified — without opening Manage. */}
                  <p className={styles.proofsCountSummary}>
                    {t("proofsCountSummary", {
                      approved: completions.filter(
                        (c) => c.status === "approved"
                      ).length,
                      pending: completions.filter(
                        (c) => c.status === "pending"
                      ).length,
                    })}
                  </p>
                  <AvatarStack
                    // Dedupe by user_id so a submitter with multiple
                    // entries (streak / multi-day) shows up once. The
                    // modal lists all their entries inside.
                    items={Array.from(
                      new Map(
                        completions.map((c) => [
                          c.user.id,
                          {
                            id: c.user.id,
                            name: c.user.display_name,
                            avatarUrl: c.user.avatar_url ?? null,
                            status: (c.status === "approved"
                              ? "approved"
                              : c.status === "rejected"
                                ? "rejected"
                                : "pending") as AvatarStatus,
                          },
                        ])
                      ).values()
                    )}
                    moreLabel={(extra) =>
                      t("andMoreCount", { count: extra })
                    }
                    onItemClick={(userId) => setRosterUserId(userId)}
                  />
                </Section>
              )}

              {/* Compact participants — same. Detailed per-row list lives
                  in Manage. */}
              <Section>
                <SectionTitle>
                  {t("participants")} ({participants.length})
                </SectionTitle>
                {participants.length === 0 ? (
                  <EmptyState
                    icon={<PixelIcon shape="flag" blockSize={6} />}
                    title={t("noParticipants")}
                    description={
                      isCreator
                        ? t("noParticipantsCreatorBody")
                        : t("noParticipantsBody")
                    }
                    action={
                      !isCreator && !isParticipant ? (
                        <Button size="sm" onClick={handleJoinClick}>
                          {t("joinChallenge")}
                        </Button>
                      ) : undefined
                    }
                    className={styles.inlineEmpty}
                  />
                ) : (
                  <AvatarStack
                    items={participants.map((p) => ({
                      id: p.id,
                      name: p.user.display_name,
                      avatarUrl: p.user.avatar_url ?? null,
                      pubkey: p.user.nostr_pubkey ?? null,
                    }))}
                    moreLabel={(extra) =>
                      t("andMoreCount", { count: extra })
                    }
                  />
                )}
              </Section>
            </div>
          </div>
        )}

        {showManage && (
          <div className={styles.col}>
            {challenge.checkpoint_mode !== "none" && pendingSubmissions.length > 0 && (
              <Section>
                <SectionTitle>
                  {t("reviewCheckpointsTitle")} ({pendingSubmissions.length}
                  {pendingCursor ? "+" : ""})
                </SectionTitle>
                <div className={styles.completionList}>
                  {pendingSubmissions.map((sub) => {
                    const cpIndex = challenge.checkpoints.findIndex(
                      (c) => c.id === sub.checkpoint_id
                    );
                    const cp = cpIndex >= 0 ? challenge.checkpoints[cpIndex] : null;
                    return (
                      <CheckpointSubmissionCard
                        key={sub.id}
                        submission={sub}
                        checkpoint={cp}
                        checkpointOrder={cp ? cpIndex + 1 : null}
                        loading={actionLoading === `cpv_${sub.id}`}
                        rejectReason={rejectReasons[sub.id] ?? ""}
                        onRejectReasonChange={(next) =>
                          setRejectReasons((prev) => {
                            const updated = { ...prev };
                            if (next) updated[sub.id] = next;
                            else delete updated[sub.id];
                            return updated;
                          })
                        }
                        onApprove={() =>
                          handleVerifyCheckpoint(sub.id, "approved")
                        }
                        onReject={() =>
                          handleVerifyCheckpoint(sub.id, "rejected")
                        }
                      />
                    );
                  })}
                </div>
                {pendingCursor && (
                  <div className={styles.loadMoreRow}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={loadMorePendingSubmissions}
                      disabled={loadingMorePending}
                    >
                      {loadingMorePending ? tCommon("loading") : t("loadMore")}
                    </Button>
                  </div>
                )}
              </Section>
            )}

            {manageRoster.completedParticipants.length > 0 && (
              <Section>
                <SectionTitle>
                  {t("completions")} ({manageRoster.completedParticipants.length})
                </SectionTitle>
                <div className={styles.rosterList}>
                  {manageRoster.completedParticipants.map((p) => {
                    const userComps =
                      manageRoster.submissionsByUser.get(p.user_id) ?? [];
                    const status = rollUpStatus(userComps);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={styles.rosterRow}
                        onClick={() => setRosterUserId(p.user_id)}
                      >
                        <Avatar
                          src={p.user.avatar_url ?? null}
                          name={p.user.display_name}
                          alt={p.user.display_name}
                          size="md"
                          status={status}
                        />
                        <span className={styles.rosterName}>
                          {p.user.display_name}
                        </span>
                        <span className={styles.rosterTags}>
                          <Tag
                            variant={
                              status === "approved"
                                ? "green"
                                : status === "rejected"
                                  ? "red"
                                  : "gold"
                            }
                          >
                            {tCommon(status)}
                          </Tag>
                          {manageRoster.hasBadge &&
                            badgeRecipientUserIds.has(p.user_id) && (
                              <Tag variant="gold">
                                {t("badgeEarnedTag")}
                              </Tag>
                            )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* When there are completions, show the "more participants"
                section for users who joined but haven't submitted yet
                (so the creator can still see the full roster). When
                there are zero completions, fall back to the plain
                "Participants" section since there's nothing to split. */}
            {(manageRoster.completedParticipants.length === 0
              ? participants
              : manageRoster.pendingParticipants
            ).length > 0 && (
              <Section>
                <SectionTitle>
                  {manageRoster.completedParticipants.length === 0
                    ? `${t("participants")} (${participants.length})`
                    : `${t("manageMoreParticipants")} (${manageRoster.pendingParticipants.length})`}
                </SectionTitle>
                <div className={styles.rosterList}>
                  {(manageRoster.completedParticipants.length === 0
                    ? participants
                    : manageRoster.pendingParticipants
                  ).map((p) => (
                    <div
                      key={p.id}
                      className={cn(styles.rosterRow, styles.rosterRowStatic)}
                    >
                      <Avatar
                        src={p.user.avatar_url ?? null}
                        name={p.user.display_name}
                        alt={p.user.display_name}
                        size="md"
                        pubkey={p.user.nostr_pubkey ?? null}
                      />
                      <span className={styles.rosterName}>
                        {p.user.display_name}
                      </span>
                      <span className={styles.rosterTags}>
                        <Tag
                          variant={
                            p.status === "completed" ? "green" : "purple"
                          }
                        >
                          {tCommon(p.status)}
                        </Tag>
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <RewardDistributionPanel
              isCreator={isCreator}
              prizeAmountSats={challenge.prize_amount_sats}
              prizeDistribution={challenge.prize_distribution}
              rewardsPaidAt={challenge.rewards_paid_at}
              resultNostrEventId={challenge.result_nostr_event_id}
              claimLoading={actionLoading === "reward"}
              republishResultLoading={actionLoading === "republishResult"}
              rewardStatus={rewardStatus}
              rewardError={rewardError}
              onClaimReward={requestClaimReward}
              onRepublishResult={handleRepublishResult}
            />
          </div>
        )}
      </div>

      {shareContext && (
        <ShareOnNostrModal
          context={shareContext}
          onClose={() => setShareContext(null)}
        />
      )}

      {rosterUserId && (() => {
        // Build a unified entries list off whatever submission shape
        // this challenge actually uses. Checkpoint-mode pulls the
        // per-step rows (every status, sorted by checkpoint order) so
        // the modal can show full history; non-checkpoint pulls the
        // challenge-level completions (streak / one-shot proofs).
        const isCheckpointMode = challenge.checkpoint_mode !== "none";
        const rosterUser =
          participants.find((p) => p.user_id === rosterUserId)?.user;
        const userName = rosterUser?.display_name ?? "";
        // Local profile page is the canonical destination for a
        // pubkey now — same content as the user's Nostr identity but
        // also surfaces Arena-specific context (their challenges +
        // badges) without leaving the app. Guards against a literal
        // "undefined" URL when the user has no pubkey on record
        // (shouldn't happen for Nostr-auth users).
        const userProfileUrl = rosterUser?.nostr_pubkey
          ? `/profile/${rosterUser.nostr_pubkey}`
          : null;
        const entries = isCheckpointMode
          ? allCheckpointCompletions
              .filter((c) => c.user.id === rosterUserId)
              .map((c) => {
                const cpIndex = challenge.checkpoints.findIndex(
                  (cp) => cp.id === c.checkpoint_id
                );
                const cp = cpIndex >= 0 ? challenge.checkpoints[cpIndex] : null;
                const baseLabel = t("submissionStepLabel", {
                  index: cpIndex + 1,
                });
                return {
                  id: c.id,
                  label: cp ? `${baseLabel} — ${cp.title}` : baseLabel,
                  sortKey: cpIndex,
                  status: c.status,
                  content: c.content,
                  imageUrl: c.image_url,
                  proofEventId: c.proof_event_id,
                  rejectReason: c.reject_reason,
                  loading: actionLoading === `cpv_${c.id}`,
                  onApprove:
                    isCreator && c.status === "pending"
                      ? () => handleVerifyCheckpoint(c.id, "approved")
                      : undefined,
                  onReject:
                    isCreator && c.status === "pending"
                      ? () => handleVerifyCheckpoint(c.id, "rejected")
                      : undefined,
                  zapTarget: null as CompletionItem | null,
                };
              })
              .sort((a, b) => a.sortKey - b.sortKey)
          : completions
              .filter((c) => c.user.id === rosterUserId)
              .map((c, idx) => ({
                id: c.id,
                label: t("submissionStepLabel", { index: idx + 1 }),
                sortKey: idx,
                status: c.status as "pending" | "approved" | "rejected",
                content: c.content,
                imageUrl: c.image_url,
                proofEventId: c.proof_event_id,
                rejectReason: null as string | null,
                loading: actionLoading === c.id,
                onApprove:
                  isCreator && c.status === "pending"
                    ? () => handleApprove(c.id)
                    : undefined,
                onReject:
                  isCreator && c.status === "pending"
                    ? () => handleReject(c.id)
                    : undefined,
                zapTarget: c as CompletionItem | null,
              }));
        return (
          <Modal
            onClose={() => setRosterUserId(null)}
            title={
              <span className={styles.submissionModalHeader}>
                <Avatar
                  src={rosterUser?.avatar_url ?? null}
                  name={userName}
                  alt=""
                  size="sm"
                />
                <span>
                  {t.rich("submissionDetailsTitle", {
                    name: userName,
                    link: (chunks) =>
                      userProfileUrl ? (
                        <Link
                          href={userProfileUrl}
                          className={styles.submissionModalHeaderLink}
                          aria-label={t(
                            "submissionDetailsProfileLinkLabel",
                            { name: userName }
                          )}
                        >
                          {chunks}
                        </Link>
                      ) : (
                        <>{chunks}</>
                      ),
                  })}
                </span>
              </span>
            }
          >
            {entries.length === 0 ? (
              <EmptyState
                title={t("noCompletions")}
                description={t("noCompletionsBody")}
                className={styles.submissionModalEmpty}
              />
            ) : (
              <div className={styles.submissionModalList}>
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={styles.submissionModalEntry}
                  >
                    <div className={styles.submissionModalEntryHead}>
                      <span className={styles.submissionModalEntryLabel}>
                        {entry.label}
                      </span>
                      <Tag
                        variant={
                          entry.status === "approved"
                            ? "green"
                            : entry.status === "rejected"
                              ? "red"
                              : "gold"
                        }
                      >
                        {tCommon(entry.status)}
                      </Tag>
                    </div>
                    {entry.content ? (
                      <p className={styles.submissionModalContent}>
                        {entry.content}
                      </p>
                    ) : (
                      !entry.imageUrl && (
                        <p className={styles.submissionModalEmpty}>
                          {t("submissionEmptyContent")}
                        </p>
                      )
                    )}
                    {entry.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={entry.imageUrl}
                        alt={entry.content ?? t("proofImageAlt")}
                        className={styles.submissionModalImage}
                        width={480}
                        height={480}
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    {entry.rejectReason && (
                      <p className={styles.submissionModalContent}>
                        <strong>
                          {t("checkpointRejectReasonLabel")}:
                        </strong>{" "}
                        {entry.rejectReason}
                      </p>
                    )}
                    {entry.proofEventId && (
                      <p className={styles.submissionModalContent}>
                        <a
                          href={`https://njump.me/${entry.proofEventId}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {t("proofFound")}: {entry.proofEventId.slice(0, 16)}…
                        </a>
                      </p>
                    )}
                    <div className={styles.submissionModalActions}>
                      {entry.onApprove && (
                        <Button
                          size="sm"
                          onClick={entry.onApprove}
                          disabled={entry.loading}
                        >
                          {entry.loading
                            ? t("approving")
                            : tCommon("approve")}
                        </Button>
                      )}
                      {entry.onReject && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={entry.onReject}
                          disabled={entry.loading}
                        >
                          {tCommon("reject")}
                        </Button>
                      )}
                    </div>
                    {entry.zapTarget &&
                      entry.zapTarget.user.nostr_pubkey &&
                      sessionUser?.nostr_pubkey !==
                        entry.zapTarget.user.nostr_pubkey &&
                      (() => {
                        const pk = entry.zapTarget.user.nostr_pubkey;
                        const ludStatus = submitterLudStatus[pk] ?? "loading";
                        const noLud16 = ludStatus === "missing";
                        const isLoading = zapLoadingId === entry.zapTarget.id;
                        return (
                          <Button
                            size="sm"
                            variant="secondary"
                            className={styles.submissionZapButton}
                            onClick={() =>
                              openZapAmountPicker(entry.zapTarget!)
                            }
                            disabled={
                              isLoading || noLud16 || ludStatus === "loading"
                            }
                            title={noLud16 ? t("zapNoAddress") : undefined}
                            aria-label={
                              noLud16
                                ? t("zapNoAddress")
                                : isLoading
                                  ? t("zapSending")
                                  : "Zap"
                            }
                          >
                            <BoltIcon size={16} color="white" />
                          </Button>
                        );
                      })()}
                  </div>
                ))}
              </div>
            )}
          </Modal>
        );
      })()}

      {showCreatorJoinWarning && (
        <Modal
          onClose={() => setShowCreatorJoinWarning(false)}
          title={t("creatorJoinWarningTitle")}
          size="sm"
        >
          <p className={styles.confirmMessage}>{t("creatorJoinWarning")}</p>
          <div className={styles.confirmActions}>
            <Button
              variant="outline"
              onClick={() => setShowCreatorJoinWarning(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={confirmCreatorJoin}>
              {tCommon("continue")}
            </Button>
          </div>
        </Modal>
      )}

      {showLeaveConfirm && (
        <Modal
          onClose={() => setShowLeaveConfirm(false)}
          title={t("leaveChallengeTitle")}
          size="sm"
        >
          <p className={styles.confirmMessage}>{t("leaveChallengeConfirm")}</p>
          <div className={styles.confirmActions}>
            <Button
              variant="outline"
              onClick={() => setShowLeaveConfirm(false)}
            >
              {tCommon("cancel")}
            </Button>
            {/*
              Destructive "Leave" instead of generic "Continue" so a
              user scanning the modal knows what's about to happen.
              The destructive variant tints the button red to match
              the rest of the leave/abandon affordances.
            */}
            <Button variant="danger" onClick={confirmLeave}>
              {t("leaveDestructive")}
            </Button>
          </div>
        </Modal>
      )}

      {rejectTargetId && (
        <Modal
          onClose={() => {
            setRejectTargetId(null);
            setRejectReasonDraft("");
          }}
          title={t("rejectConfirmTitle")}
          size="sm"
        >
          <p className={styles.confirmMessage}>
            {t("rejectConfirmDescription")}
          </p>
          <label
            htmlFor="reject-reason-input"
            className={styles.rejectReasonLabel}
          >
            {t("rejectReasonLabel")}
          </label>
          <textarea
            id="reject-reason-input"
            className={styles.rejectReasonInput}
            value={rejectReasonDraft}
            onChange={(e) => setRejectReasonDraft(e.target.value)}
            placeholder={t("rejectReasonPlaceholder")}
            rows={4}
            maxLength={MAX_REJECT_REASON_LEN}
            autoFocus
          />
          <div className={styles.confirmActions}>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTargetId(null);
                setRejectReasonDraft("");
              }}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={confirmRejectCompletion}
              disabled={rejectReasonDraft.trim().length === 0}
            >
              {t("rejectConfirmCta")}
            </Button>
          </div>
        </Modal>
      )}

      {showRewardConfirm && challenge && (() => {
        // Mirror the server's distribution math (app/api/challenges/[id]
        // /reward/route.ts) so the confirm dialog tells the truth:
        //   - first_to_complete → 1 winner
        //   - split             → every completed participant
        //   - tiered            → up to 3 (top finishers)
        // We count `participants.status === "completed"` because that's
        // exactly the set the server picks from. Default to 1 when the
        // distribution mode is missing or "none" — clicking Pay should
        // never show "Pay 0 winners" for a challenge that has any sats
        // staked.
        const completedCount = participants.filter(
          (p) => p.status === "completed"
        ).length;
        let winnerCount = 1;
        if (challenge.prize_distribution === "split") {
          winnerCount = Math.max(1, completedCount);
        } else if (challenge.prize_distribution === "tiered") {
          winnerCount = Math.max(1, Math.min(3, completedCount));
        }
        return (
        <Modal
          onClose={() => setShowRewardConfirm(false)}
          title={t("rewardConfirmTitle", { count: winnerCount })}
          size="sm"
        >
          <p className={styles.confirmMessage}>
            {t("rewardConfirmDescription", {
              amount: challenge.prize_amount_sats.toLocaleString(locale),
            })}
          </p>
          <div className={styles.confirmActions}>
            <Button
              variant="outline"
              onClick={() => setShowRewardConfirm(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleClaimReward}>
              {t("rewardConfirmCta")}
            </Button>
          </div>
        </Modal>
        );
      })()}

      {zapAmountTarget && (
        <Modal
          onClose={closeZapAmountPicker}
          title={t("zapAmountTitle")}
          size="sm"
        >
          <p className={styles.zapInvoiceHint}>{t("zapAmountDescription")}</p>
          <label className={styles.zapAmountLabel} htmlFor="zap-amount-input">
            {t("zapAmountLabel")}
          </label>
          <div className={styles.zapAmountPresets}>
            {[21, 100, 500, 1000, 5000].map((preset) => {
              const isActive = !zapAmountCustom && zapAmountPreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`${styles.zapAmountPreset} ${isActive ? styles.zapAmountPresetActive : ""}`}
                  onClick={() => {
                    setZapAmountPreset(preset);
                    setZapAmountCustom("");
                  }}
                  aria-pressed={isActive}
                >
                  <BoltIcon size={12} />
                  {preset.toLocaleString()}
                </button>
              );
            })}
          </div>
          <input
            id="zap-amount-input"
            type="number"
            className={styles.zapAmountInput}
            placeholder={t("zapAmountCustomPlaceholder")}
            value={zapAmountCustom}
            min={1}
            onChange={(e) => setZapAmountCustom(e.target.value)}
          />
          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={handleConfirmZapAmount}
            disabled={
              !zapAmountTarget ||
              (!zapAmountPreset && !zapAmountCustom) ||
              (!!zapAmountCustom && (isNaN(Number(zapAmountCustom)) || Number(zapAmountCustom) <= 0))
            }
          >
            <BoltIcon size={16} color="white" />
            {t("zapAmountSend", {
              amount: (zapAmountCustom && !isNaN(Number(zapAmountCustom))
                ? Math.floor(Number(zapAmountCustom))
                : zapAmountPreset
              ).toLocaleString(),
            })}
          </Button>
        </Modal>
      )}

      {zapInvoice && (
        <Modal
          onClose={() => setZapInvoice(null)}
          title={t("zapInvoiceTitle")}
          size="sm"
        >
          <p className={styles.zapInvoiceHint}>
            {t("zapInvoiceHint", { amount: zapInvoice.sats })}
          </p>
          <div className={styles.zapInvoiceQr}>
            <QRCodeSVG
              value={zapInvoice.pr}
              size={200}
              bgColor="transparent"
              fgColor="var(--color-text-primary)"
              level="M"
            />
          </div>
          <div className={styles.zapInvoiceBox}>
            <code className={styles.zapInvoiceText}>{zapInvoice.pr}</code>
          </div>
          <button className={styles.zapInvoiceCopyBtn} onClick={handleCopyZapInvoice}>
            <CopyIcon size={16} />
            {invoiceCopied ? t("zapInvoiceCopied") : t("zapCopyInvoice")}
          </button>
        </Modal>
      )}

      {rewardInvoice && (
        <Modal
          onClose={() => finishRewardPay("cancelled")}
          title={t("rewardQrTitle", {
            name: rewardInvoice.name,
            index: rewardInvoice.index,
            total: rewardInvoice.total,
          })}
          size="sm"
        >
          <p className={styles.zapInvoiceHint}>
            {t("rewardQrHint", { amount: rewardInvoice.sats })}
          </p>
          <div className={styles.zapInvoiceQr}>
            <QRCodeSVG
              value={rewardInvoice.pr}
              size={200}
              bgColor="transparent"
              fgColor="var(--color-text-primary)"
              level="M"
            />
          </div>
          <div className={styles.zapInvoiceBox}>
            <code className={styles.zapInvoiceText}>{rewardInvoice.pr}</code>
          </div>
          <button
            className={styles.zapInvoiceCopyBtn}
            onClick={() => copyRewardInvoice(rewardInvoice.pr)}
          >
            <CopyIcon size={16} />
            {rewardInvoiceCopied ? t("zapInvoiceCopied") : t("zapCopyInvoice")}
          </button>
          <p className={styles.zapInvoiceHint}>{t("rewardQrWaiting")}</p>
        </Modal>
      )}
    </div>
  );
}

