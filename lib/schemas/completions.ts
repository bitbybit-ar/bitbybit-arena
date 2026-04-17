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

/** POST /api/completions/[id]/verify — creator approves or rejects. */
export const VerifyCompletionBodySchema = z.object({
  status: ApprovalStatusSchema,
});

export type VerifyCompletionBody = z.infer<typeof VerifyCompletionBodySchema>;

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

/** POST /api/challenges/[id]/checkpoints/[checkpointId]/complete */
export const CompleteCheckpointBodySchema = z.object({
  content: z
    .string()
    .nullish()
    .transform((v) => (v == null ? null : v)),
  method: VerificationMethodSchema.optional(),
});

export type CompleteCheckpointBody = z.infer<
  typeof CompleteCheckpointBodySchema
>;

/** GET /api/challenges/[id]/completions — `?status=` filter. */
export const ListCompletionsQuerySchema = z.object({
  status: CompletionStatusSchema.optional(),
});
