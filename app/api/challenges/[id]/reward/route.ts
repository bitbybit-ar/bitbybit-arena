import { NextRequest } from "next/server";
import { eq, and, asc, desc } from "drizzle-orm";
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

  // Winners are participants with status='completed', ordered by earliest
  // completion. For first_to_complete, we take the single earliest. For
  // split, everyone. For tiered, the top 3.
  const completers = await db
    .select({
      user_id: participants.user_id,
      completed_at: participants.completed_at,
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

  if (completers.length === 0) {
    throw new BadRequestError("No completed participants to reward");
  }

  let selected: typeof completers = [];
  let amounts: number[] = [];

  if (distribution === "first_to_complete") {
    selected = completers.slice(0, 1);
    amounts = [challenge.prize_amount_sats];
  } else if (distribution === "split") {
    selected = completers;
    const per = Math.floor(challenge.prize_amount_sats / completers.length);
    amounts = selected.map(() => per);
    // Push the rounding remainder onto the first-place winner.
    const remainder =
      challenge.prize_amount_sats - per * completers.length;
    if (remainder > 0) amounts[0] += remainder;
  } else {
    selected = completers.slice(0, 3);
    amounts = tieredSplit(challenge.prize_amount_sats, selected.length);
  }

  // Fill in missing lightning addresses from kind:0 metadata for every
  // winner in parallel. Each relay fetch has an 8s timeout, so doing
  // them sequentially would make split-mode rewards hang for 8s × N.
  // Retained (creator) winners don't need a resolved address — they
  // aren't paid, so we skip the lookup entirely.
  const resolvedLightningAddresses = await Promise.all(
    selected.map(async (row) => {
      if (row.user_id === challenge.creator_id) return null;
      if (row.lightning_address) return row.lightning_address;
      if (!row.nostr_pubkey) return null;
      const meta = await fetchNostrMetadataServer(row.nostr_pubkey);
      return meta?.lud16 || null;
    })
  );

  const winners: WinnerPayload[] = selected.map((row, i) => {
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
        amount_sats: amounts[i],
        retained: false,
      };
    }
    return {
      user_id: row.user_id,
      nostr_pubkey: row.nostr_pubkey,
      display_name: row.display_name,
      lightning_address: null,
      amount_sats: amounts[i],
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
// Body is optional. If `user_id` + `receipt_event_id` are provided, we
// record the NIP-57 kind 9735 receipt id on that winner's most recent
// approved completion. Regardless of body, we flip
// challenge.rewards_paid_at to now() so the UI can stop showing the
// "Claim reward" button. The receipt write-back is best-effort because
// most WebLN wallets don't return the on-relay receipt event id today.
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

  const { user_id: winnerUserId, receipt_event_id: receiptEventId } =
    await parseBody(req, RecordRewardBodySchema);

  if (winnerUserId && receiptEventId) {
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

    if (!target) {
      throw new BadRequestError(
        "No approved completion found for that winner on this challenge"
      );
    }

    await db
      .update(completions)
      .set({ reward_zap_receipt_id: receiptEventId })
      .where(eq(completions.id, target.id));
  }

  await db
    .update(challenges)
    .set({ rewards_paid_at: new Date() })
    .where(eq(challenges.id, params.id));

  return { ok: true };
});
