import { NextRequest } from "next/server";
import { eq, sql, and, lt, desc } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { MyChallengesQuerySchema } from "@/lib/schemas/challenges";
import {
  challenges,
  participants,
  challenge_checkpoints,
  checkpoint_completions,
} from "@/lib/db/schema";

// GET /api/my-challenges — challenges I created + joined. Paginated per
// tab with a cursor (ISO `created_at` / `joined_at` of the last row)
// plus a shared `limit`. Checkpoint counts come from pre-aggregated
// CTEs joined once, not from correlated subqueries per row.
export const GET = apiHandler(async (req: NextRequest, { session, db }) => {
  const { scope, cursor, limit } = parseQuery(req, MyChallengesQuerySchema);
  const userId = session!.user_id;

  const fetchCreated = scope !== "joined";
  const fetchJoined = scope !== "created";

  // Active participants per challenge. Matches the old correlated
  // subquery semantics (excludes `withdrawn`).
  const participantCountsCte = db.$with("participant_counts").as(
    db
      .select({
        challenge_id: participants.challenge_id,
        count: sql<number>`COUNT(*) FILTER (WHERE ${participants.status} <> 'withdrawn')::int`.as(
          "count"
        ),
      })
      .from(participants)
      .groupBy(participants.challenge_id)
  );

  // Checkpoint count per challenge (independent of participant).
  const checkpointTotalsCte = db.$with("checkpoint_totals").as(
    db
      .select({
        challenge_id: challenge_checkpoints.challenge_id,
        total: sql<number>`COUNT(*)::int`.as("total"),
      })
      .from(challenge_checkpoints)
      .groupBy(challenge_checkpoints.challenge_id)
  );

  // Per-participant approved + pending checkpoint counters. Two
  // counters in one aggregation via FILTER keeps the CTE small.
  const participantCheckpointStatsCte = db.$with("participant_checkpoint_stats").as(
    db
      .select({
        participant_id: checkpoint_completions.participant_id,
        approved: sql<number>`COUNT(*) FILTER (WHERE ${checkpoint_completions.status} = 'approved')::int`.as(
          "approved"
        ),
        pending: sql<number>`COUNT(*) FILTER (WHERE ${checkpoint_completions.status} = 'pending')::int`.as(
          "pending"
        ),
      })
      .from(checkpoint_completions)
      .groupBy(checkpoint_completions.participant_id)
  );

  const emptyPage = { items: [] as Record<string, unknown>[], nextCursor: null as string | null };

  const createdPage = { ...emptyPage };
  if (fetchCreated) {
    const conditions = [eq(challenges.creator_id, userId)];
    if (cursor && scope === "created") {
      conditions.push(lt(challenges.created_at, new Date(cursor)));
    }

    const rows = await db
      .with(participantCountsCte)
      .select({
        challenge: challenges,
        participant_count: participantCountsCte.count,
      })
      .from(challenges)
      .leftJoin(
        participantCountsCte,
        eq(participantCountsCte.challenge_id, challenges.id)
      )
      .where(and(...conditions))
      .orderBy(desc(challenges.created_at))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = rows.slice(0, limit);
    createdPage.items = sliced.map((r) => ({
      ...r.challenge,
      participant_count: r.participant_count ?? 0,
      role: "creator",
    }));
    const last = sliced[sliced.length - 1]?.challenge.created_at;
    createdPage.nextCursor =
      hasMore && last instanceof Date ? last.toISOString() : null;
  }

  const joinedPage = { ...emptyPage };
  if (fetchJoined) {
    const conditions = [eq(participants.user_id, userId)];
    if (cursor && scope === "joined") {
      conditions.push(lt(participants.joined_at, new Date(cursor)));
    }

    const rows = await db
      .with(
        participantCountsCte,
        checkpointTotalsCte,
        participantCheckpointStatsCte
      )
      .select({
        challenge: challenges,
        participant_count: participantCountsCte.count,
        checkpoints_total: checkpointTotalsCte.total,
        checkpoints_approved: participantCheckpointStatsCte.approved,
        checkpoints_pending: participantCheckpointStatsCte.pending,
        participation: participants,
      })
      .from(participants)
      .innerJoin(challenges, eq(participants.challenge_id, challenges.id))
      .leftJoin(
        participantCountsCte,
        eq(participantCountsCte.challenge_id, challenges.id)
      )
      .leftJoin(
        checkpointTotalsCte,
        eq(checkpointTotalsCte.challenge_id, challenges.id)
      )
      .leftJoin(
        participantCheckpointStatsCte,
        eq(participantCheckpointStatsCte.participant_id, participants.id)
      )
      .where(and(...conditions))
      .orderBy(desc(participants.joined_at))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = rows.slice(0, limit);
    joinedPage.items = sliced.map((r) => ({
      ...r.challenge,
      participant_count: r.participant_count ?? 0,
      checkpoints_total: r.checkpoints_total ?? 0,
      checkpoints_approved: r.checkpoints_approved ?? 0,
      checkpoints_pending: r.checkpoints_pending ?? 0,
      participation: r.participation,
      role: "participant",
    }));
    const last = sliced[sliced.length - 1]?.participation.joined_at;
    joinedPage.nextCursor =
      hasMore && last instanceof Date ? last.toISOString() : null;
  }

  return { created: createdPage, joined: joinedPage };
});
