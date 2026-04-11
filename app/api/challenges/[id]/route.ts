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
import type { ChallengeType, VerificationMethod, PrizeDistribution } from "@/lib/types";

const VALID_TYPES: ChallengeType[] = ["one_time", "streak", "competition", "race", "creative"];
const VALID_VERIFICATION: VerificationMethod[] = [
  "creator_approval",
  "automatic",
  "nostr_action",
  "nostr_hashtag",
];
const VALID_DISTRIBUTION: PrizeDistribution[] = ["first_to_complete", "winner_takes_all", "split", "tiered", "none"];
const VALID_STATUSES = ["open", "in_progress", "completed", "cancelled"];
const HEX_64 = /^[0-9a-f]{64}$/i;
const MAX_CATEGORY_LEN = 50;
const MAX_UNIT_LEN = 30;
const MAX_BADGE_NAME_LEN = 100;

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
  if (body.verification_methods !== undefined) {
    if (!Array.isArray(body.verification_methods) || body.verification_methods.length === 0) {
      throw new BadRequestError("verification_methods must be a non-empty array");
    }
    const seen = new Set<VerificationMethod>();
    for (const m of body.verification_methods) {
      if (typeof m !== "string" || !VALID_VERIFICATION.includes(m as VerificationMethod)) {
        throw new BadRequestError(
          `verification_methods contains an invalid value. Must be one of: ${VALID_VERIFICATION.join(", ")}`
        );
      }
      seen.add(m as VerificationMethod);
    }
    updates.verification_methods = Array.from(seen);
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) throw new BadRequestError("Invalid status");
    updates.status = body.status;
  }
  if (body.prize_distribution !== undefined) {
    if (!VALID_DISTRIBUTION.includes(body.prize_distribution)) throw new BadRequestError("Invalid prize distribution");
    updates.prize_distribution = body.prize_distribution;
  }
  if (body.category !== undefined) {
    if (body.category !== null && (typeof body.category !== "string" || body.category.length > MAX_CATEGORY_LEN)) {
      throw new BadRequestError(`category must be a string of at most ${MAX_CATEGORY_LEN} characters`);
    }
    updates.category = body.category;
  }
  if (body.goal !== undefined) {
    if (body.goal !== null && (!Number.isInteger(body.goal) || body.goal < 0)) {
      throw new BadRequestError("goal must be a non-negative integer");
    }
    updates.goal = body.goal;
  }
  if (body.unit !== undefined) {
    if (body.unit !== null && (typeof body.unit !== "string" || body.unit.length > MAX_UNIT_LEN)) {
      throw new BadRequestError(`unit must be a string of at most ${MAX_UNIT_LEN} characters`);
    }
    updates.unit = body.unit;
  }
  if (body.prize_amount_sats !== undefined) {
    if (typeof body.prize_amount_sats !== "number" || body.prize_amount_sats < 0) {
      throw new BadRequestError("prize_amount_sats must be a non-negative number");
    }
    updates.prize_amount_sats = body.prize_amount_sats;
  }
  if (body.badge_name !== undefined) {
    if (body.badge_name !== null && (typeof body.badge_name !== "string" || body.badge_name.length > MAX_BADGE_NAME_LEN)) {
      throw new BadRequestError(`badge_name must be a string of at most ${MAX_BADGE_NAME_LEN} characters`);
    }
    updates.badge_name = body.badge_name;
  }
  if (body.starts_at !== undefined) {
    if (body.starts_at !== null) {
      const d = new Date(body.starts_at);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestError("starts_at must be a valid date");
      }
      updates.starts_at = d;
    } else {
      updates.starts_at = null;
    }
  }
  if (body.ends_at !== undefined) {
    if (body.ends_at !== null) {
      const d = new Date(body.ends_at);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestError("ends_at must be a valid date");
      }
      updates.ends_at = d;
    } else {
      updates.ends_at = null;
    }
  }
  if (body.zap_goal_event_id !== undefined) {
    if (body.zap_goal_event_id === null) {
      updates.zap_goal_event_id = null;
    } else if (
      typeof body.zap_goal_event_id !== "string" ||
      !HEX_64.test(body.zap_goal_event_id)
    ) {
      throw new BadRequestError(
        "zap_goal_event_id must be a 64-character hex event id"
      );
    } else {
      updates.zap_goal_event_id = body.zap_goal_event_id.toLowerCase();
    }
  }

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
