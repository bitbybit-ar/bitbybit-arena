import { NextRequest } from "next/server";
import { eq, sql, and, asc } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { NotFoundError, ForbiddenError, BadRequestError } from "@/lib/api/errors";
import { UpdateChallengeBodySchema } from "@/lib/schemas/challenges";
import {
  challenges,
  users,
  participants,
  challenge_checkpoints,
  checkpoint_completions,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import type { PendingCheckpointSubmission } from "@/lib/types";

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

    // Pending checkpoint submissions — only surfaced to the creator so
    // they can approve/reject. Join through participants → users to
    // render who submitted what without a second round-trip. `created_at`
    // is a Date here; apiHandler's JSON serialization turns it into the
    // ISO string the shared `PendingCheckpointSubmission` type expects.
    type PendingSubmissionRow = Omit<PendingCheckpointSubmission, "created_at"> & {
      created_at: Date;
    };
    let pendingCheckpointSubmissions: PendingSubmissionRow[] = [];
    if (
      session &&
      checkpoints.length > 0 &&
      rows[0].challenge.creator_id === session.user_id
    ) {
      const pending = await db
        .select({
          id: checkpoint_completions.id,
          checkpoint_id: checkpoint_completions.checkpoint_id,
          participant_id: checkpoint_completions.participant_id,
          content: checkpoint_completions.content,
          image_url: checkpoint_completions.image_url,
          proof_event_id: checkpoint_completions.proof_event_id,
          created_at: checkpoint_completions.created_at,
          user_id: users.id,
          username: users.username,
          display_name: users.display_name,
          avatar_url: users.avatar_url,
          nostr_pubkey: users.nostr_pubkey,
        })
        .from(checkpoint_completions)
        .innerJoin(
          challenge_checkpoints,
          eq(checkpoint_completions.checkpoint_id, challenge_checkpoints.id)
        )
        .innerJoin(
          participants,
          eq(checkpoint_completions.participant_id, participants.id)
        )
        .innerJoin(users, eq(participants.user_id, users.id))
        .where(
          and(
            eq(challenge_checkpoints.challenge_id, params.id),
            eq(checkpoint_completions.status, "pending")
          )
        )
        .orderBy(asc(checkpoint_completions.created_at));
      pendingCheckpointSubmissions = pending.map((p) => ({
        id: p.id,
        checkpoint_id: p.checkpoint_id,
        participant_id: p.participant_id,
        content: p.content,
        image_url: p.image_url,
        proof_event_id: p.proof_event_id,
        created_at: p.created_at,
        participant: {
          user: {
            id: p.user_id,
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            nostr_pubkey: p.nostr_pubkey,
          },
        },
      }));
    }

    return {
      ...rows[0].challenge,
      participant_count: rows[0].participant_count,
      completion_count: rows[0].completion_count,
      creator: rows[0].creator,
      checkpoints,
      my_checkpoint_completions: myCheckpointCompletions,
      pending_checkpoint_submissions: pendingCheckpointSubmissions,
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

  // Parsed body only contains the keys the client actually sent —
  // Zod strips missing optionals — so spreading directly into the
  // update set preserves PATCH-style semantics. `null` values for
  // nullish fields (e.g. `badge_name: null`) survive the spread and
  // clear the column as intended.
  const updates = await parseBody(req, UpdateChallengeBodySchema);

  const [updated] = await db
    .update(challenges)
    .set({ ...updates, updated_at: new Date() })
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
