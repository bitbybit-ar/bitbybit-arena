/**
 * Schemas for `/api/auth/*`. Only POST /api/auth/nostr has a body;
 * the GET (challenge issue) and signout endpoints are bodyless.
 */
import { z } from "zod";

const SIGNER_TYPES = ["extension", "nsec", "nip46"] as const;

export const SignerTypeSchema = z.enum(SIGNER_TYPES);

/**
 * Outer envelope check only — `validateAuthEvent` does the real
 * signature + challenge verification downstream. We require nothing
 * past `pubkey: string` here so the API boundary stays as permissive
 * as the legacy "if (!signedEvent) throw" did, and the cryptographic
 * checks remain the single source of truth for "is this signed event
 * actually valid". Test fixtures and any client that sends only the
 * minimum fields will fail at the verifier, not at parse time.
 */
const SignedAuthEventSchema = z
  .object({
    pubkey: z.string().min(1, "signed event is missing a pubkey"),
  })
  .passthrough();

export const AuthNostrPostBodySchema = z.object({
  signedEvent: SignedAuthEventSchema,
  signer_type: SignerTypeSchema.nullish().transform((v) => v ?? null),
});

export type AuthNostrPostBody = z.infer<typeof AuthNostrPostBodySchema>;
