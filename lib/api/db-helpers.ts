import { eq, and, sql, type InferSelectModel } from "drizzle-orm";
import { getTableName, type Table } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/lib/db";
import { challenges, participants, users } from "@/lib/db/schema";
import { NotFoundError, ForbiddenError } from "./errors";

// The drizzle-inferred row shape (dates as `Date`, not ISO strings).
// `lib/types.ts#Participant` is the serialized-to-client shape and
// doesn't apply to raw DB reads.
export type ParticipantRow = InferSelectModel<typeof participants>;

// Turn a snake_case / plural table name into a singular PascalCase label
// for the error message ("challenges" → "Challenge"). Covers the common
// drizzle naming convention used in this codebase; any caller that
// wants a different label can pass `resourceName` explicitly.
function defaultResourceName(tableName: string): string {
  if (!tableName) return "Resource";
  const singular = tableName.endsWith("s") ? tableName.slice(0, -1) : tableName;
  const pascal = singular
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ")
    .trim();
  return pascal || "Resource";
}

interface FindResourceOptions<T extends PgTable> {
  resourceName?: string;
  ownerField?: keyof InferSelectModel<T>;
  session?: { user_id: string };
  forbiddenMessage?: string;
}

/**
 * Fetch a single row by primary key and optionally assert the session
 * user owns it. Consolidates the "SELECT ... LIMIT 1; 404 if missing;
 * 403 if not owner" triplet repeated across API routes.
 *
 * - Throws `NotFoundError(resourceName)` when no row matches.
 * - Throws `ForbiddenError(forbiddenMessage)` when `ownerField` +
 *   `session` are provided and `row[ownerField] !== session.user_id`.
 */
export async function findResourceOrOwn<T extends PgTable>(
  db: Db,
  table: T,
  id: string,
  options: FindResourceOptions<T> = {}
): Promise<InferSelectModel<T>> {
  const {
    resourceName,
    ownerField,
    session,
    forbiddenMessage = "Only the owner can perform this action",
  } = options;

  // `id` is a convention — every table in this schema has a uuid PK
  // named `id`. Cast through `unknown` to reconcile drizzle's narrow
  // column type with the generic `PgTable` parameter; callers only see
  // the fully typed row back.
  const idColumn = (table as unknown as { id: Parameters<typeof eq>[0] }).id;

  const rows = await db
    .select()
    .from(table as PgTable)
    .where(eq(idColumn, id))
    .limit(1);

  const row = rows[0] as InferSelectModel<T> | undefined;

  if (!row) {
    const label = resourceName ?? defaultResourceName(getTableName(table as Table));
    throw new NotFoundError(label);
  }

  if (ownerField && session) {
    const ownerValue = (row as Record<string, unknown>)[ownerField as string];
    if (ownerValue !== session.user_id) {
      throw new ForbiddenError(forbiddenMessage);
    }
  }

  return row;
}

/**
 * Lookup the `participants` row for a (challenge, user) pair. Returns
 * `undefined` when the user hasn't joined the challenge. Callers that
 * need to filter by `status` (active/completed/withdrawn) should build
 * their own query — those have distinct semantics.
 */
export async function findParticipation(
  db: Db,
  challengeId: string,
  userId: string
): Promise<ParticipantRow | undefined> {
  const [row] = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.challenge_id, challengeId),
        eq(participants.user_id, userId)
      )
    )
    .limit(1);

  return row;
}

// Shape of the public "creator" projection that several challenge
// endpoints spread onto the response. Kept narrow so consumers don't
// leak `notification_prefs` / timestamps through the wire.
export interface ChallengeCreatorProjection {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  nostr_pubkey: string;
  lightning_address: string | null;
}

export interface ChallengeWithCounts extends InferSelectModel<typeof challenges> {
  participant_count: number;
  completion_count: number;
  creator: ChallengeCreatorProjection;
}

/**
 * Fetch a single challenge row plus the two derived scalar counts
 * (`participant_count` and `completion_count`) and the public creator
 * projection. Consolidates the joined-subquery shape that the single-
 * challenge GET used to hand-roll.
 *
 * Returns `null` when no row matches — callers decide whether 404 is
 * the right response. Callers that want the plain challenge row
 * without these derived fields should stick with `findResourceOrOwn`.
 */
export async function fetchChallengeWithCounts(
  db: Db,
  challengeId: string
): Promise<ChallengeWithCounts | null> {
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
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...row.challenge,
    participant_count: row.participant_count,
    completion_count: row.completion_count,
    creator: row.creator,
  };
}
