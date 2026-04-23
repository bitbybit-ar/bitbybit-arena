import { NextRequest } from "next/server";
import { eq, and, asc, desc, isNull } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from "@/lib/api/errors";
import { RecordRewardBodySchema } from "@/lib/schemas/challenges";
import { PAYOUT_DISTRIBUTIONS } from "@/lib/schemas/enums";
import {
  challenges,
  participants,
  completions,
  users,
} from "@/lib/db/schema";
import { fetchNostrMetadataServer } from "@/lib/nostr/server-metadata";
import type { PrizeDistribution } from "@/lib/types";
import { createNotification } from "@/lib/notifications";

interface WinnerPayload {
  user_id: string;
  nostr_pubkey: string;
  display_name: string;
  // null when retained=true — the creator isn't paid themselves and
  // we don't even resolve their address from relay metadata.
  lightning_address: string | null;
  amount_sats: number;
  // True when the winner is the challenge creator. The UI skips retained
  // entries in the zap queue and displays "X sats retained by creator".
  retained: boolean;
}

// Tiered payout: 50% / 30% / 20% of the prize pot rounded to whole sats
// (anything left over goes to the first-place winner).
function tieredSplit(total: number, winners: number): number[] {
  if (winners === 0) return [];
  const weights = [0.5, 0.3, 0.2].slice(0, Math.min(winners, 3));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const scaled = weights.map((w) => Math.floor((w / totalWeight) * total));
  const remainder = total - scaled.reduce((a, b) => a + b, 0);
  scaled[0] += remainder;
  while (scaled.length < winners) scaled.push(0);
  return scaled;
}

// POST /api/challenges/[id]/reward — creator-only.
// Returns the list of winners with their lightning addresses and the
// amount each should receive, derived from challenge.prize_distribution.
// The client then signs a NIP-57 zap request per winner, fetches an
// invoice, pays via WebLN, and PATCHes back to record each receipt.
export const POST = apiHandler(async (_req: NextRequest, { session, db, params }) => {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);
  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.creator_id !== session!.user_id) {
    throw new ForbiddenError("Only the creator can distribute rewards");
  }
  if (!challenge.prize_amount_sats || challenge.prize_amount_sats <= 0) {
    throw new BadRequestError("This challenge has no prize configured");
  }
  const distribution = challenge.prize_distribution as PrizeDistribution | null;
  if (
    !distribution ||
    !PAYOUT_DISTRIBUTIONS.includes(
      distribution as (typeof PAYOUT_DISTRIBUTIONS)[number]
    )
  ) {
    throw new BadRequestError(
      "Challenge has no payout-eligible prize_distribution"
    );
  }

  // Winners are participants with status='completed' who HAVE NOT
  // already been rewarded, ordered by earliest completion. Excluding
  // `rewarded_at IS NOT NULL` means a mid-loop crash (creator paid 2
  // of 3 winners then closed the tab) leaves the two paid rows marked
  // and a retry only surfaces the remaining unpaid winner. Without
  // this filter, a retry would re-offer everyone and double-pay.
  //
  // Distribution math still runs against the *full* completer list
  // below: the pot and the per-winner share are fixed at the moment
  // the challenge is distributed, not recomputed around who's left.
  // That way a second retry after a partial payout still pays the
  // unpaid winner the same amount they were originally entitled to.
  const allCompleters = await db
    .select({
      user_id: participants.user_id,
      completed_at: participants.completed_at,
      rewarded_at: participants.rewarded_at,
      nostr_pubkey: users.nostr_pubkey,
      display_name: users.display_name,
      lightning_address: users.lightning_address,
    })
    .from(participants)
    .innerJoin(users, eq(participants.user_id, users.id))
    .where(
      and(
        eq(participants.challenge_id, params.id),
        eq(participants.status, "completed")
      )
    )
    .orderBy(asc(participants.completed_at));

  if (allCompleters.length === 0) {
    throw new BadRequestError("No completed participants to reward");
  }

  let selected: typeof allCompleters = [];
  let amounts: number[] = [];

  if (distribution === "first_to_complete") {
    selected = allCompleters.slice(0, 1);
    amounts = [challenge.prize_amount_sats];
  } else if (distribution === "split") {
    selected = allCompleters;
    const per = Math.floor(challenge.prize_amount_sats / allCompleters.length);
    amounts = selected.map(() => per);
    // Push the rounding remainder onto the first-place winner.
    const remainder =
      challenge.prize_amount_sats - per * allCompleters.length;
    if (remainder > 0) amounts[0] += remainder;
  } else {
    selected = allCompleters.slice(0, 3);
    amounts = tieredSplit(challenge.prize_amount_sats, selected.length);
  }

  // Filter already-paid winners out BEFORE the lud16 lookup so a
  // retry after a mid-loop crash (a) doesn't re-offer paid winners
  // and (b) doesn't re-validate their lud16 (an already-paid winner
  // whose profile lud16 rotated would otherwise 400 the whole retry).
  // Distribution math above runs on the full list so per-winner
  // amounts stay fixed across retries — a 5000/3000/2000 split stays
  // 5000/3000/2000 even if only 2000 is still unpaid.
  const unpaid = selected
    .map((row, i) => ({ row, amount: amounts[i] }))
    .filter(({ row }) => !row.rewarded_at);

  if (unpaid.length === 0) {
    throw new BadRequestError(
      "All winners already rewarded on this challenge"
    );
  }

  // Fill in missing lightning addresses from kind:0 metadata for every
  // unpaid winner in parallel. Each relay fetch has an 8s timeout, so
  // doing them sequentially would make split-mode rewards hang for
  // 8s × N. Retained (creator) winners don't need a resolved address
  // — they aren't paid, so we skip the lookup entirely.
  const resolvedLightningAddresses = await Promise.all(
    unpaid.map(async ({ row }) => {
      if (row.user_id === challenge.creator_id) return null;
      if (row.lightning_address) return row.lightning_address;
      if (!row.nostr_pubkey) return null;
      const meta = await fetchNostrMetadataServer(row.nostr_pubkey);
      return meta?.lud16 || null;
    })
  );

  const winners: WinnerPayload[] = unpaid.map(({ row, amount }, i) => {
    const retained = row.user_id === challenge.creator_id;
    if (!retained) {
      const ln = resolvedLightningAddresses[i];
      if (!ln) {
        throw new BadRequestError(
          `Winner ${row.display_name} has no lightning address on their Nostr profile`
        );
      }
      return {
        user_id: row.user_id,
        nostr_pubkey: row.nostr_pubkey,
        display_name: row.display_name,
        lightning_address: ln,
        amount_sats: amount,
        retained: false,
      };
    }
    return {
      user_id: row.user_id,
      nostr_pubkey: row.nostr_pubkey,
      display_name: row.display_name,
      lightning_address: null,
      amount_sats: amount,
      retained: true,
    };
  });

  return {
    challenge_id: challenge.id,
    prize_distribution: distribution,
    total_prize_sats: challenge.prize_amount_sats,
    winners,
  };
});

// PATCH /api/challenges/[id]/reward — creator-only.
// Body must request at least one action (empty body 400s):
//   - `user_id` — stamp `participants.rewarded_at` for that winner so
//     a retried POST /reward skips them. This is the mid-loop signal
//     the client sends as each zap settles. `receipt_event_id` is
//     optional (WebLN usually doesn't return one); when provided we
//     also record the kind:9735 id on the winner's most recent
//     approved completion.
//   - `all_winners_paid: true` — stamp `challenges.rewards_paid_at`,
//     the only way to flip the challenge-level "paid" state.
//     Also catches any still-unmarked participants (retained creator
//     winners that the client skipped) so a retry can't re-offer
//     them.
//   - Both — do both in one request.
export const PATCH = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);
  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.creator_id !== session!.user_id) {
    throw new ForbiddenError("Only the creator can record rewards");
  }

  const {
    user_id: winnerUserId,
    receipt_event_id: receiptEventId,
    all_winners_paid: allWinnersPaid,
  } = await parseBody(req, RecordRewardBodySchema);

  if (winnerUserId) {
    // Guard: the target user must actually be a completed participant
    // on this challenge. Prevents stamping an unrelated row and also
    // 404s if the caller sends a stale user id.
    const [participantRow] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.challenge_id, params.id),
          eq(participants.user_id, winnerUserId),
          eq(participants.status, "completed")
        )
      )
      .limit(1);

    if (!participantRow) {
      throw new BadRequestError(
        "No completed participant found for that user on this challenge"
      );
    }

    await db
      .update(participants)
      .set({ rewarded_at: new Date() })
      .where(eq(participants.id, participantRow.id));

    if (receiptEventId) {
      const [target] = await db
        .select({ id: completions.id })
        .from(completions)
        .where(
          and(
            eq(completions.challenge_id, params.id),
            eq(completions.user_id, winnerUserId),
            eq(completions.status, "approved")
          )
        )
        .orderBy(desc(completions.submitted_at))
        .limit(1);

      if (target) {
        await db
          .update(completions)
          .set({ reward_zap_receipt_id: receiptEventId })
          .where(eq(completions.id, target.id));
      }
      // If there's no approved completion (edge case: a participant
      // flipped to `completed` via checkpoints without an approved
      // completion row), we still stamp `rewarded_at` above and swallow
      // the receipt — no place to put it, not worth 400ing over.
    }

    // Skip self-pay: creators who win their own challenge don't get a
    // prize (retained=true), so there's nothing to notify them about.
    if (winnerUserId !== challenge.creator_id) {
      try {
        await createNotification(
          winnerUserId,
          "prize_awarded",
          "You won sats!",
          `You received the prize for "${challenge.title}".`,
          {
            challenge: challenge.title,
            challenge_id: challenge.id,
            receipt_event_id: receiptEventId ?? null,
          }
        );
      } catch (err) {
        console.error("notification:prize_awarded failed", err);
      }
    }
  }

  if (allWinnersPaid) {
    // Stamp the challenge AND mop up any still-unmarked participants
    // (typically the retained creator, which the client skips in the
    // zap loop). Without this sweep, POST /reward on this challenge
    // would still see them as "unpaid" and either 400 or re-offer.
    await db
      .update(challenges)
      .set({ rewards_paid_at: new Date() })
      .where(eq(challenges.id, params.id));

    await db
      .update(participants)
      .set({ rewarded_at: new Date() })
      .where(
        and(
          eq(participants.challenge_id, params.id),
          eq(participants.status, "completed"),
          isNull(participants.rewarded_at)
        )
      );
  }

  return { ok: true };
});
