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

// Re-export so route files only have to import from one place.
export { NostrPubkeySchema };
