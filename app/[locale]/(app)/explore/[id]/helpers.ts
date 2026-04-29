import type { Dispatch, SetStateAction } from "react";
import type {
  ChallengeCheckpointCompletion,
  ParticipantItem,
} from "@/lib/types";
import {
  defaultDraft,
  type CheckpointDraft,
} from "@/components/challenges/CheckpointCompletionSection";
import type { ChallengeDetail, CompletionItem } from "./types";

// Same cadence as the landing ZapModal's NWC polling. 4 s keeps latency
// tolerable without hammering the wallet endpoint.
export const REWARD_POLL_INTERVAL_MS = 4000;

// Cap rendered avatars so a 200-participant challenge doesn't paint a
// 200-circle wall in the General tab. Anything beyond gets rolled up
// into a "+N" pill — the detailed list lives in Manage anyway.
export const AVATAR_STACK_LIMIT = 12;

// Merge a partial patch into the per-checkpoint draft at `id`, seeding
// a default draft when the slot is empty. Declared at module scope so
// every call site shares one reference — that keeps the inline arrow
// bindings for React's setState calls short and grep-friendly.
export function updateCheckpointDraft(
  setDrafts: Dispatch<SetStateAction<Record<string, CheckpointDraft>>>,
  id: string,
  patch: Partial<CheckpointDraft>
) {
  setDrafts((prev) => ({
    ...prev,
    [id]: { ...(prev[id] ?? defaultDraft()), ...patch },
  }));
}

// Per-viewer derivations for the General tab's "Your progress"
// section. Pulled out of the JSX so the render reads straight from
// the destructured values instead of re-running these filters inside
// an inline IIFE every render.
export function deriveMyProgress(
  challenge: ChallengeDetail,
  participants: ParticipantItem[],
  completions: CompletionItem[],
  sessionUserId: string | null
) {
  const myParticipation = sessionUserId
    ? participants.find((p) => p.user_id === sessionUserId)
    : undefined;
  const myProgress = myParticipation?.progress ?? 0;
  const completed = myParticipation?.status === "completed";
  const myCompletions = sessionUserId
    ? completions.filter((c) => c.user.id === sessionUserId)
    : [];
  const goal = challenge.goal;
  const pct = goal
    ? Math.min(100, Math.round((myProgress / goal) * 100))
    : null;
  // Whether the participant should still see proof-submission affordances
  // (Nostr verify buttons + manual textarea). Two reasons to hide them:
  //
  //   1. `completed` — server flipped `participants.status` after the
  //      auto-approve path. Existing behavior.
  //   2. One-shot challenge (`goal` null or 1) with a non-rejected
  //      submission already in flight. With the new "Nostr proof +
  //      creator review" combo (#111), the row lands `pending` and
  //      `participants.status` stays `active`, so reason (1) doesn't
  //      cover it. The participant has nothing more to do — the proof
  //      either gets approved (done) or rejected (UI un-hides on the
  //      next refresh because `hasInFlight` flips to false).
  //
  // Multi-step challenges (`goal > 1`) keep allowing submissions because
  // each one counts as a separate step toward the goal.
  const hasInFlight = myCompletions.some((c) => c.status !== "rejected");
  const isOneShot = !goal || goal === 1;
  const canSubmitMore = !completed && !(isOneShot && hasInFlight);
  return {
    myParticipation,
    myProgress,
    completed,
    myCompletions,
    goal,
    pct,
    canSubmitMore,
  };
}

// Per-user roll-ups for the Manage tab. Builds the submissions map
// once and partitions participants into "has at least one submission"
// (rendered in the Completaciones section) vs "no submissions yet"
// (rendered in Más participantes). For checkpoint-mode challenges,
// "submissions" includes per-checkpoint completions too so a user
// who has only worked on checkpoints (and never sent a challenge-
// level proof) still appears in the actionable roster.
export function deriveManageRoster(
  participants: ParticipantItem[],
  completions: CompletionItem[],
  checkpointCompletions: ChallengeCheckpointCompletion[],
  challenge: ChallengeDetail
) {
  const submissionsByUser = new Map<string, CompletionItem[]>();
  for (const c of completions) {
    const list = submissionsByUser.get(c.user.id) ?? [];
    list.push(c);
    submissionsByUser.set(c.user.id, list);
  }
  // Set of user_ids with any kind of submission — challenge-level OR
  // checkpoint-level. Drives the completed-vs-pending split below.
  const userIdsWithSubmissions = new Set(submissionsByUser.keys());
  for (const cc of checkpointCompletions) {
    userIdsWithSubmissions.add(cc.user.id);
  }
  const completedParticipants = participants.filter((p) =>
    userIdsWithSubmissions.has(p.user_id)
  );
  const pendingParticipants = participants.filter(
    (p) => !userIdsWithSubmissions.has(p.user_id)
  );
  const hasBadge = !!(challenge.badge_name || challenge.badge_image_url);
  return {
    submissionsByUser,
    completedParticipants,
    pendingParticipants,
    hasBadge,
  };
}

// Pick the most-actionable status across a user's submissions: pending
// wins (creator still has work to do), then rejected (creator already
// passed but submitter could resubmit), then approved.
export function rollUpStatus(
  comps: CompletionItem[]
): "approved" | "pending" | "rejected" {
  if (comps.some((c) => c.status === "pending")) return "pending";
  if (
    comps.some((c) => c.status === "rejected") &&
    !comps.some((c) => c.status === "approved")
  ) {
    return "rejected";
  }
  return "approved";
}

export function typeVariant(
  type: string
): "purple" | "gold" | "green" | "red" {
  switch (type) {
    case "streak":
      return "gold";
    case "competition":
      return "red";
    case "creative":
      return "green";
    default:
      return "purple";
  }
}

export function statusKey(status: string): string {
  switch (status) {
    case "in_progress":
      return "inProgress";
    default:
      return status;
  }
}
