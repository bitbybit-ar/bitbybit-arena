import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "@/lib/api/errors";
import {
  AwardBadgesBodySchema,
  RecordBadgeAwardBodySchema,
} from "@/lib/schemas/challenges";
import { challenges, participants, badges } from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications";

// POST /api/challenges/[id]/award — creator awards badges to participants
// Body: { user_ids: string[] } — list of participant user IDs to award
export const POST = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);

  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.creator_id !== session!.user_id) {
    throw new ForbiddenError("Only the challenge creator can award badges");
  }

  const { user_ids } = await parseBody(req, AwardBadgesBodySchema);

  // Verify all users are participants
  const validParticipants = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.challenge_id, params.id),
        inArray(participants.user_id, user_ids)
      )
    );

  const participantUserIds = new Set(validParticipants.map((p) => p.user_id));
  const invalidIds = user_ids.filter((id: string) => !participantUserIds.has(id));
  if (invalidIds.length > 0) {
    throw new BadRequestError(`These users are not participants: ${invalidIds.join(", ")}`);
  }

  // Check for existing badges
  const existingBadges = await db
    .select()
    .from(badges)
    .where(
      and(
        eq(badges.challenge_id, params.id),
        inArray(badges.user_id, user_ids)
      )
    );

  const alreadyAwarded = new Set(existingBadges.map((b) => b.user_id));
  const newUserIds = user_ids.filter((id: string) => !alreadyAwarded.has(id));

  if (newUserIds.length === 0) {
    throw new ConflictError("All specified users already have badges for this challenge");
  }

  const badgeName = challenge.badge_name || challenge.title;

  const awarded = await db
    .insert(badges)
    .values(
      newUserIds.map((user_id: string) => ({
        challenge_id: params.id,
        user_id,
        badge_name: badgeName,
        badge_image_url: challenge.badge_image_url,
      }))
    )
    .returning();

  // Mark awarded participants as completed
  await db
    .update(participants)
    .set({ status: "completed", completed_at: new Date() })
    .where(
      and(
        eq(participants.challenge_id, params.id),
        inArray(participants.user_id, newUserIds)
      )
    );

  // One notification per newly awarded recipient. Skip the creator to
  // avoid self-ping when they award themselves in a challenge they also
  // participated in.
  await Promise.all(
    newUserIds
      .filter((uid: string) => uid !== challenge.creator_id)
      .map((uid: string) =>
        createNotification(
          uid,
          "badge_earned",
          "New badge!",
          `You earned the "${badgeName}" badge for "${challenge.title}".`,
          {
            badge: badgeName,
            challenge: challenge.title,
            challenge_id: challenge.id,
          }
        ).catch((err) => {
          console.error("notification:badge_earned failed", err);
        })
      )
  );

  return new CreatedResponse(awarded);
});

// PATCH /api/challenges/[id]/award — creator records the kind:8 event id
// published for a previously awarded recipient. Called by the client after
// it signs + publishes the badge award event, so badges.nostr_event_id
// stops being dead storage.
export const PATCH = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, params.id))
    .limit(1);

  if (!challenge) throw new NotFoundError("Challenge");
  if (challenge.creator_id !== session!.user_id) {
    throw new ForbiddenError("Only the challenge creator can record badge event ids");
  }

  const { user_id, nostr_event_id } = await parseBody(
    req,
    RecordBadgeAwardBodySchema
  );

  const [badge] = await db
    .select()
    .from(badges)
    .where(
      and(
        eq(badges.challenge_id, params.id),
        eq(badges.user_id, user_id)
      )
    )
    .limit(1);

  if (!badge) {
    throw new NotFoundError("Badge");
  }

  const [updated] = await db
    .update(badges)
    .set({ nostr_event_id })
    .where(eq(badges.id, badge.id))
    .returning();

  return updated;
});
