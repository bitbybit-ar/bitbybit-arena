/**
 * Schemas for the completion endpoints — both the challenge-level
 * completion (`/api/challenges/[id]/completions`) and the per-checkpoint
 * variant (`/api/challenges/[id]/checkpoints/[id]/complete`), plus the
 * creator review endpoint (`/api/completions/[id]/verify`).
 *
 * The "method" field is validated as an optional VerificationMethod
 * here; the route still calls `pickVerificationMethod()` against the
 * actual challenge config to enforce that the chosen method is one
 * the challenge actually advertises (Zod can't see that join state).
 */
import { z } from "zod";
import {
  CompletionStatusSchema,
  VerificationMethodSchema,
} from "./enums";
import { HttpUrlSchema } from "./primitives";

const ApprovalStatusSchema = z.enum(["approved", "rejected"]);

// Exported so client-side textareas can hard-cap matching the server
// schema. Single source of truth — bumping this value updates both
// the maxLength attribute and the Zod validator at once.
export const MAX_REJECT_REASON_LEN = 500;

/**
 * POST /api/completions/[id]/verify — creator approves or rejects.
 *
 * Mirrors the checkpoint variant: an optional `reject_reason` the
 * creator can show the participant on the rejected state, capped at
 * 500 chars and normalised so empty/whitespace stores as null.
 */
export const VerifyCompletionBodySchema = z.object({
  status: ApprovalStatusSchema,
  reject_reason: z
    .string()
    .max(
      MAX_REJECT_REASON_LEN,
      `reject_reason must be at most ${MAX_REJECT_REASON_LEN} characters`
    )
    .nullish()
    .transform((v) => {
      if (v == null) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
});

export type VerifyCompletionBody = z.infer<typeof VerifyCompletionBodySchema>;

/**
 * POST /api/checkpoint-completions/[id]/verify — the checkpoint
 * version also accepts an optional `reject_reason` the creator can
 * show the participant on the rejected state. The field is ignored
 * when `status === "approved"` (cleared on the update) and only
 * required strings are persisted — empty / whitespace normalises
 * to null.
 */
export const VerifyCheckpointCompletionBodySchema = z.object({
  status: ApprovalStatusSchema,
  reject_reason: z
    .string()
    .max(
      MAX_REJECT_REASON_LEN,
      `reject_reason must be at most ${MAX_REJECT_REASON_LEN} characters`
    )
    .nullish()
    .transform((v) => {
      if (v == null) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
});

export type VerifyCheckpointCompletionBody = z.infer<
  typeof VerifyCheckpointCompletionBodySchema
>;

/**
 * POST /api/challenges/[id]/completions — submit a proof.
 *
 * Either `content` (≥ 5 chars when not empty) or `image_url` is
 * required for manual proofs; for `nostr_action` / `nostr_hashtag`
 * the route fills both in itself, so the cross-field rule is
 * deferred to the handler (it knows which method was selected).
 */
export const SubmitCompletionBodySchema = z.object({
  content: z
    .string()
    .nullish()
    .transform((v) => (v == null ? null : v)),
  image_url: HttpUrlSchema.optional(),
  step: z.number().int().nullish(),
  method: VerificationMethodSchema.optional(),
});

export type SubmitCompletionBody = z.infer<typeof SubmitCompletionBodySchema>;

/**
 * POST /api/challenges/[id]/checkpoints/[checkpointId]/complete
 *
 * Mirrors `SubmitCompletionBodySchema`: either `content` (≥ 5 chars when
 * not empty) or `image_url` is required for manual proofs. The cross-
 * field rule is enforced in the handler because the required fields
 * depend on the verification method the checkpoint actually advertises.
 */
export const CompleteCheckpointBodySchema = z.object({
  content: z
    .string()
    .nullish()
    .transform((v) => (v == null ? null : v)),
  image_url: HttpUrlSchema.optional(),
  method: VerificationMethodSchema.optional(),
});

export type CompleteCheckpointBody = z.infer<
  typeof CompleteCheckpointBodySchema
>;

/** GET /api/challenges/[id]/completions — `?status=` filter. */
export const ListCompletionsQuerySchema = z.object({
  status: CompletionStatusSchema.optional(),
});
