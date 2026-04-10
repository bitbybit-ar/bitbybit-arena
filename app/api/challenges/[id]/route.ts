import { NextRequest } from "next/server";
import { eq, sql, and, asc } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { NotFoundError, ForbiddenError, BadRequestError } from "@/lib/api/errors";
import {
  challenges,
  users,
  participants,
  challenge_checkpoints,
  checkpoint_completions,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import type { ChallengeType, VerificationType, PrizeDistribution } from "@/lib/types";

const VALID_TYPES: ChallengeType[] = ["one_time", "streak", "competition", "race", "creative"];
const VALID_VERIFICATION: VerificationType[] = ["creator_approval", "automatic"];
const VALID_DISTRIBUTION: PrizeDistribution[] = ["first_to_complete", "winner_takes_all", "split", "none"];
const VALID_STATUSES = ["open", "in_progress", "completed", "cancelled"];

// GET /api/challenges/[id] — get single challenge with creator and participant count
export const GET = apiHandler(
  async (_req: NextRequest, { db, params }) => {
    const rows = await db
      .select({
        challenge: challenges,
        creator: {
          id: users.id,
          username: users.username,
          display_name: users.display_name,
          avatar_url: users.avatar_url,
          nostr_pubkey: users.nostr_pubkey,
          lightning_address: users.lightning_address,
        },
        participant_count: sql<number>`(
          SELECT COUNT(*)::int FROM participants
          WHERE participants.challenge_id = ${challenges.id}
          AND participants.status != 'withdrawn'
        )`,
        completion_count: sql<number>`(
          SELECT COUNT(*)::int FROM completions
          WHERE completions.challenge_id = ${challenges.id}
        )`,
      })
      .from(challenges)
      .innerJoin(users, eq(challenges.creator_id, users.id))
      .where(eq(challenges.id, params.id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError("Challenge");

    const checkpoints = await db
      .select()
      .from(challenge_checkpoints)
      .where(eq(challenge_checkpoints.challenge_id, params.id))
      .orderBy(asc(challenge_checkpoints.order));

    // Current user's checkpoint completions, if they are a participant.
    const session = await getSession();
    let myCheckpointCompletions: (typeof checkpoint_completions.$inferSelect)[] = [];
    if (session && checkpoints.length > 0) {
      const [myParticipation] = await db
        .select({ id: participants.id })
        .from(participants)
        .where(
          and(
            eq(participants.challenge_id, params.id),
            eq(participants.user_id, session.user_id)
          )
        )
        .limit(1);
      if (myParticipation) {
        myCheckpointCompletions = await db
          .select()
          .from(checkpoint_completions)
          .where(eq(checkpoint_completions.participant_id, myParticipation.id));
      }
    }

    return {
      ...rows[0].challenge,
      participant_count: rows[0].participant_count,
      completion_count: rows[0].completion_count,
      creator: rows[0].creator,
      checkpoints,
      my_checkpoint_completions: myCheckpointCompletions,
    };
  },
  { requireAuth: false }
);

// PUT /api/challenges/[id] — update (creator only)
export const PUT = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const [existing] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);

  if (!existing) throw new NotFoundError("Challenge");
  if (existing.creator_id !== session!.user_id) throw new ForbiddenError("Only the creator can edit this challenge");

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length < 3) {
      throw new BadRequestError("Title must be at least 3 characters");
    }
    updates.title = body.title.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.trim().length < 10) {
      throw new BadRequestError("Description must be at least 10 characters");
    }
    updates.description = body.description.trim();
  }
  if (body.type !== undefined) {
    if (!VALID_TYPES.includes(body.type)) throw new BadRequestError("Invalid type");
    updates.type = body.type;
  }
  if (body.verification_type !== undefined) {
    if (!VALID_VERIFICATION.includes(body.verification_type)) throw new BadRequestError("Invalid verification type");
    updates.verification_type = body.verification_type;
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) throw new BadRequestError("Invalid status");
    updates.status = body.status;
  }
  if (body.prize_distribution !== undefined) {
    if (!VALID_DISTRIBUTION.includes(body.prize_distribution)) throw new BadRequestError("Invalid prize distribution");
    updates.prize_distribution = body.prize_distribution;
  }
  if (body.category !== undefined) updates.category = body.category;
  if (body.goal !== undefined) updates.goal = body.goal;
  if (body.unit !== undefined) updates.unit = body.unit;
  if (body.prize_amount_sats !== undefined) updates.prize_amount_sats = body.prize_amount_sats;
  if (body.badge_name !== undefined) updates.badge_name = body.badge_name;
  if (body.starts_at !== undefined) updates.starts_at = body.starts_at ? new Date(body.starts_at) : null;
  if (body.ends_at !== undefined) updates.ends_at = body.ends_at ? new Date(body.ends_at) : null;

  if (Object.keys(updates).length === 0) throw new BadRequestError("No fields to update");

  updates.updated_at = new Date();

  const [updated] = await db
    .update(challenges)
    .set(updates)
    .where(eq(challenges.id, params.id))
    .returning();

  return updated;
});

// DELETE /api/challenges/[id] — delete (creator only, no active participants)
export const DELETE = apiHandler(async (_req: NextRequest, { session, db, params }) => {
  const [existing] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);

  if (!existing) throw new NotFoundError("Challenge");
  if (existing.creator_id !== session!.user_id) throw new ForbiddenError("Only the creator can delete this challenge");

  const [activeCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(participants)
    .where(
      and(
        eq(participants.challenge_id, params.id),
        eq(participants.status, "active")
      )
    );

  if (activeCount.count > 0) {
    throw new BadRequestError("Cannot delete a challenge with active participants");
  }

  await db.delete(challenges).where(eq(challenges.id, params.id));

  return { deleted: true };
});
