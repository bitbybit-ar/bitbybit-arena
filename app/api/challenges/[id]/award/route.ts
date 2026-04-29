import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { apiHandler, CreatedResponse } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { NotFoundError, BadRequestError, ConflictError } from "@/lib/api/errors";
import { findResourceOrOwn } from "@/lib/api/db-helpers";
import {
  AwardBadgesBodySchema,
  RecordBadgeAwardBodySchema,
} from "@/lib/schemas/challenges";
import { challenges, participants, badges } from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";

// POST /api/challenges/[id]/award — creator awards badges to participants
// Body: { user_ids: string[] } — list of participant user IDs to award
export const POST = apiHandler(async (req: NextRequest, { session, db, params }) => {
  const challenge = await findResourceOrOwn(db, challenges, params.id, {
    resourceName: "Challenge",
    ownerField: "creator_id",
    session: session!,
    forbiddenMessage: "Only the challenge creator can award badges",
  });

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
    throw new BadRequestError(
      `These users are not participants: ${invalidIds.join(", ")}`,
      "award_not_participants"
    );
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
    throw new ConflictError(
      "All specified users already have badges for this challenge",
      "already_awarded"
    );
  }

  const badgeName = challenge.badge_name || challenge.title;

  // Atomic: insert badges AND mark recipients as completed in one
  // implicit transaction. Previously a crash between the two writes
  // left badges awarded to participants still in "joined" status.
  const [awarded] = await db.batch([
    db
      .insert(badges)
      .values(
        newUserIds.map((user_id: string) => ({
          challenge_id: params.id,
          user_id,
          badge_name: badgeName,
          badge_image_url: challenge.badge_image_url,
        }))
      )
      .returning(),
    db
      .update(participants)
      .set({ status: "completed", completed_at: new Date() })
      .where(
        and(
          eq(participants.challenge_id, params.id),
          inArray(participants.user_id, newUserIds)
        )
      ),
  ]);

  // One notification per newly awarded recipient. We DO notify the
  // creator when they're a recipient — the creator-as-participant
  // path auto-completes their own row via `decideAutoApprove` and
  // self-awards the badge from the client, so without the bell
  // entry there's no in-app trail of "you earned the badge for the
  // challenge you also created" beyond the transient toast.
  // Participants who don't want self-pings can opt out via the
  // per-type `notification_prefs` toggles in Settings.
  await Promise.all(
    newUserIds.map((uid: string) =>
      notifyUser(
        uid,
        "badge_earned",
        "New badge!",
        `You earned the "${badgeName}" badge for "${challenge.title}".`,
        {
          badge: badgeName,
          challenge: challenge.title,
          challenge_id: challenge.id,
        }
      )
    )
  );

  return new CreatedResponse(awarded);
});

// PATCH /api/challenges/[id]/award — creator records the kind:8 event id
// published for a previously awarded recipient. Called by the client after
// it signs + publishes the badge award event, so badges.nostr_event_id
// stops being dead storage.
export const PATCH = apiHandler(async (req: NextRequest, { session, db, params }) => {
  await findResourceOrOwn(db, challenges, params.id, {
    resourceName: "Challenge",
    ownerField: "creator_id",
    session: session!,
    forbiddenMessage: "Only the challenge creator can record badge event ids",
  });

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
