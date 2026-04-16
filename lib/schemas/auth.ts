/**
 * Schemas for `/api/auth/*`. Only POST /api/auth/nostr has a body;
 * the GET (challenge issue) and signout endpoints are bodyless.
 */
import { z } from "zod";
import { NostrPubkeySchema } from "./primitives";

const SIGNER_TYPES = ["extension", "nsec", "nip46"] as const;

export const SignerTypeSchema = z.enum(SIGNER_TYPES);

/**
 * Signed kind:22242 NIP-42 auth event the client sends back after
 * signing the challenge. We don't validate the full kind:22242 shape
 * here — that's `validateAuthEvent`'s job, which actually checks the
 * Schnorr signature against the challenge tag. We just guard the
 * outer envelope so a missing pubkey or non-string content gives a
 * clean 400 instead of a runtime crash inside the validator.
 */
const SignedAuthEventSchema = z.object({
  pubkey: NostrPubkeySchema,
  id: z.string(),
  sig: z.string(),
  kind: z.number(),
  created_at: z.number(),
  content: z.string(),
  tags: z.array(z.array(z.string())),
});

export const AuthNostrPostBodySchema = z.object({
  signedEvent: SignedAuthEventSchema,
  signer_type: SignerTypeSchema.nullish().transform((v) => v ?? null),
});

export type AuthNostrPostBody = z.infer<typeof AuthNostrPostBodySchema>;
