/**
 * Request schemas for `/api/challenges`. We start from a drizzle-zod
 * `createInsertSchema(challenges)` so column-level rules (varchar
 * caps, NOT NULL, .default()) come from the table definition
 * automatically, then narrow / extend it for the public POST contract.
 *
 * Anything that isn't a 1:1 row insert (query params, nested
 * checkpoints, cross-field rules) is plain Zod composed from the
 * primitives in `./primitives`.
 */
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { challenges } from "@/lib/db/schema";
import {
  ChallengeStatusSchema,
  ChallengeTypeSchema,
  CheckpointModeSchema,
  PrizeDistributionSchema,
  PAYOUT_DISTRIBUTIONS,
  VerificationMethodSchema,
} from "./enums";
import {
  CsvHexListSchema,
  Hex64Schema,
  HashtagSchema,
  HttpUrlSchema,
  NostrPubkeySchema,
  SlugSchema,
  TagsSchema,
} from "./primitives";
import { IsoCursorSchema, LimitSchema } from "./pagination";

const MAX_CHECKPOINTS = 20;
const MAX_BADGE_NAME_LEN = 100;
const SORT_OPTIONS = [
  "newest",
  "ending_soon",
  "most_participants",
  "most_active",
  "trending",
] as const;

const VerificationMethodsSchema = z
  .array(VerificationMethodSchema)
  .min(1, "must be a non-empty array")
  .transform((arr) => Array.from(new Set(arr)));

/**
 * Per-checkpoint input shape used inside the POST body. Pulls in the
 * verification-methods array and conditionally requires the matching
 * Nostr fields when the participant has to do something on Nostr to
 * complete it.
 */
const CheckpointInputSchema = z
  .object({
    title: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(3, "title must be at least 3 characters")),
    description: z
      .string()
      .nullish()
      .transform((s) => {
        if (s === undefined || s === null) return null;
        const trimmed = s.trim();
        return trimmed.length === 0 ? null : trimmed;
      }),
    verification_methods: VerificationMethodsSchema.default([
      "creator_approval",
    ]),
    nostr_action_target_event_id: Hex64Schema.nullish().transform(
      (v) => v ?? null
    ),
    nostr_hashtag: HashtagSchema.nullish().transform((v) => v ?? null),
  })
  .superRefine((cp, ctx) => {
    if (
      cp.verification_methods.includes("nostr_action") &&
      !cp.nostr_action_target_event_id
    ) {
      ctx.addIssue({
        code: "custom",
        message: "nostr_action requires a 64-character hex event id",
        path: ["nostr_action_target_event_id"],
      });
    }
    if (
      cp.verification_methods.includes("nostr_hashtag") &&
      !cp.nostr_hashtag
    ) {
      ctx.addIssue({
        code: "custom",
        message: "nostr_hashtag is required",
        path: ["nostr_hashtag"],
      });
    }
  });

export type CheckpointInput = z.infer<typeof CheckpointInputSchema>;

// drizzle-zod gives us the column-level rules (varchar lengths, NOT
// NULL, .default()) for free. We override only the columns whose API
// contract differs from raw "insert this row":
//   - title/description: have minimum lengths the column doesn't know
//   - everything Nostr-shaped: lower-case + 64-hex regex via Hex64
//   - badge_image_url: scheme allow-list via HttpUrl
const ChallengeRowInsertSchema = createInsertSchema(challenges, {
  slug: SlugSchema,
  title: (s) =>
    s
      .transform((v) => v.trim())
      .pipe(z.string().min(3, "Title must be at least 3 characters")),
  description: (s) =>
    s
      .transform((v) => v.trim())
      .pipe(
        z.string().min(10, "Description must be at least 10 characters")
      ),
  type: ChallengeTypeSchema,
  prize_distribution: PrizeDistributionSchema,
  checkpoint_mode: CheckpointModeSchema,
  badge_name: (s) =>
    s.max(MAX_BADGE_NAME_LEN, `badge_name must be at most ${MAX_BADGE_NAME_LEN} characters`),
  badge_image_url: HttpUrlSchema,
  nostr_event_id: Hex64Schema,
  badge_nostr_event_id: Hex64Schema,
  zap_goal_event_id: Hex64Schema,
  nostr_action_target_event_id: Hex64Schema,
  nostr_hashtag: HashtagSchema,
});

/**
 * POST /api/challenges request body.
 *
 * The shape is deliberately written long-hand instead of `.pick()`-ing
 * from the row insert schema: the API marks several columns optional
 * even though they're NOT NULL on the row (the route fills them in
 * — `slug` from `slugify(title)`, `creator_id` from the session,
 * timestamps from defaults). Pull each field from the row insert
 * schema where the column rule applies, otherwise use the primitives
 * directly.
 */
export const CreateChallengeBodySchema = z
  .object({
    slug: ChallengeRowInsertSchema.shape.slug.optional(),
    nostr_event_id: ChallengeRowInsertSchema.shape.nostr_event_id.optional(),
    title: ChallengeRowInsertSchema.shape.title,
    description: ChallengeRowInsertSchema.shape.description,
    type: ChallengeRowInsertSchema.shape.type.optional(),
    tags: TagsSchema.optional(),
    goal: ChallengeRowInsertSchema.shape.goal.optional(),
    unit: ChallengeRowInsertSchema.shape.unit.optional(),
    verification_methods: VerificationMethodsSchema.default([
      "creator_approval",
    ]),
    nostr_action_target_event_id: Hex64Schema.nullish().transform(
      (v) => v ?? null
    ),
    nostr_hashtag: HashtagSchema.nullish().transform((v) => v ?? null),
    checkpoint_mode: CheckpointModeSchema.default("none"),
    checkpoints: z.array(CheckpointInputSchema).optional(),
    prize_amount_sats: z
      .number()
      .min(0, "prize_amount_sats must be a non-negative number")
      .optional(),
    prize_distribution: PrizeDistributionSchema.optional(),
    zap_goal_event_id: Hex64Schema.optional(),
    badge_name: ChallengeRowInsertSchema.shape.badge_name.nullish(),
    badge_image_url: HttpUrlSchema.optional(),
    starts_at: z.coerce.date().nullish(),
    ends_at: z.coerce.date().nullish(),
  })
  .superRefine((body, ctx) => {
    if (
      body.verification_methods.includes("nostr_action") &&
      !body.nostr_action_target_event_id
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nostr_action_target_event_id"],
        message:
          "nostr_action_target_event_id must be a 64-character hex event id",
      });
    }
    if (
      body.verification_methods.includes("nostr_hashtag") &&
      !body.nostr_hashtag
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nostr_hashtag"],
        message: "nostr_hashtag is required",
      });
    }

    if (
      (body.prize_amount_sats ?? 0) > 0 &&
      !PAYOUT_DISTRIBUTIONS.includes(
        body.prize_distribution as (typeof PAYOUT_DISTRIBUTIONS)[number]
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["prize_distribution"],
        message: `prize_distribution must be one of ${PAYOUT_DISTRIBUTIONS.join(", ")} when prize_amount_sats > 0`,
      });
    }

    if (body.checkpoint_mode !== "none") {
      if (!body.checkpoints || body.checkpoints.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["checkpoints"],
          message: "checkpoint_mode is set but checkpoints is empty",
        });
        return;
      }
      if (body.checkpoints.length > MAX_CHECKPOINTS) {
        ctx.addIssue({
          code: "custom",
          path: ["checkpoints"],
          message: `A challenge can have at most ${MAX_CHECKPOINTS} checkpoints`,
        });
      }
    }
  });

export type CreateChallengeBody = z.infer<typeof CreateChallengeBodySchema>;

/**
 * GET /api/challenges query string. Optional fields default to
 * sensible values so the route handler can destructure without
 * re-checking. `limit` is coerced from string and capped at 50.
 */
export const ListChallengesQuerySchema = z
  .object({
    search: z.string().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
    tag: z.string().optional(),
    tags: z.string().optional(),
    verification: VerificationMethodSchema.optional(),
    sort: z.enum(SORT_OPTIONS).default("newest"),
    cursor: z.string().optional(),
    limit: z
      .string()
      .optional()
      .transform((v) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 20;
      }),
    follow_pubkeys: CsvHexListSchema(1000),
    only_following: z
      .string()
      .optional()
      .transform((v) => v === "true"),
  })
  .transform((q) => ({
    ...q,
    // Pre-split the CSV-shaped fields the route used to parse inline
    // so the handler can use them directly.
    types: q.type
      ? (q.type
          .split(",")
          .map((t) => t.trim())
          .filter((t) =>
            (
              [
                "one_time",
                "streak",
                "competition",
                "race",
                "creative",
              ] as const
            ).some((allowed) => allowed === t)
          ) as (
          | "one_time"
          | "streak"
          | "competition"
          | "race"
          | "creative"
        )[])
      : [],
    tagsList: q.tags
      ? q.tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => /^[a-z0-9-]{1,30}$/.test(t))
      : [],
  }));

export type ListChallengesQuery = z.infer<typeof ListChallengesQuerySchema>;

/**
 * PUT /api/challenges/[id] — partial update by the creator.
 *
 * Every field is optional (PATCH-style semantics dressed as PUT). The
 * only invariant the route enforces beyond per-field validation is
 * "at least one field present"; the existing handler returned 400
 * with "No fields to update" and we keep that message.
 */
export const UpdateChallengeBodySchema = z
  .object({
    title: ChallengeRowInsertSchema.shape.title.optional(),
    description: ChallengeRowInsertSchema.shape.description.optional(),
    type: ChallengeTypeSchema.optional(),
    verification_methods: VerificationMethodsSchema.optional(),
    status: ChallengeStatusSchema.optional(),
    prize_distribution: PrizeDistributionSchema.optional(),
    tags: TagsSchema.optional(),
    goal: z
      .number()
      .int("goal must be a non-negative integer")
      .min(0, "goal must be a non-negative integer")
      .nullish(),
    unit: ChallengeRowInsertSchema.shape.unit.nullish(),
    prize_amount_sats: z
      .number()
      .min(0, "prize_amount_sats must be a non-negative number")
      .optional(),
    badge_name: ChallengeRowInsertSchema.shape.badge_name.nullish(),
    badge_image_url: HttpUrlSchema.optional(),
    badge_nostr_event_id: Hex64Schema.nullish(),
    result_nostr_event_id: Hex64Schema.nullish(),
    starts_at: z.coerce.date().nullish(),
    ends_at: z.coerce.date().nullish(),
    zap_goal_event_id: Hex64Schema.nullish(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "No fields to update",
  });

export type UpdateChallengeBody = z.infer<typeof UpdateChallengeBodySchema>;

/** POST /api/challenges/[id]/award — creator awards a list of users. */
export const AwardBadgesBodySchema = z.object({
  user_ids: z
    .array(z.string().uuid())
    .min(1, "user_ids must be a non-empty array"),
});

export type AwardBadgesBody = z.infer<typeof AwardBadgesBodySchema>;

/**
 * PATCH /api/challenges/[id]/award — record the kind:8 event id the
 * client just published for a previously awarded recipient.
 */
export const RecordBadgeAwardBodySchema = z.object({
  user_id: z.string().min(1, "user_id is required"),
  nostr_event_id: Hex64Schema,
});

export type RecordBadgeAwardBody = z.infer<typeof RecordBadgeAwardBodySchema>;

/**
 * PATCH /api/challenges/[id]/reward — record a NIP-57 zap receipt for
 * one winner. Body is optional (the route still flips
 * `rewards_paid_at` even with no body), but if any winner field is
 * present BOTH must be valid.
 */
export const RecordRewardBodySchema = z
  .object({
    user_id: z.string().optional(),
    receipt_event_id: Hex64Schema.optional(),
  })
  .superRefine((b, ctx) => {
    const hasOne =
      b.user_id !== undefined || b.receipt_event_id !== undefined;
    if (!hasOne) return; // both absent is valid — just flips the flag
    if (typeof b.user_id !== "string") {
      ctx.addIssue({
        code: "custom",
        path: ["user_id"],
        message: "user_id must be a string when provided",
      });
    }
    if (b.receipt_event_id === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["receipt_event_id"],
        message:
          "receipt_event_id must be a 64-character hex event id when provided",
      });
    }
  });

export type RecordRewardBody = z.infer<typeof RecordRewardBodySchema>;

/**
 * GET /api/my-challenges — `?scope=created|joined` (omit for both
 * tabs), `?cursor=<ISO>` + `?limit=`. When `cursor` is supplied you
 * must also set `scope` — otherwise the route can't tell which list
 * to continue. Limit is clamped to 50 and defaults to 20 to match
 * /api/my-badges.
 */
export const MyChallengesQuerySchema = z
  .object({
    scope: z.enum(["created", "joined"]).optional(),
    cursor: IsoCursorSchema,
    limit: LimitSchema(1, 50, 20),
  })
  .refine((v) => !v.cursor || !!v.scope, {
    message: "cursor requires scope=created or scope=joined",
    path: ["cursor"],
  });

// Re-export so route files only have to import from one place.
export { NostrPubkeySchema };
