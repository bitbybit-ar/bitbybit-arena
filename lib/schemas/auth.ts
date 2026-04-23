/**
 * Schemas for `/api/auth/*`.
 *
 * Post-NIP-98 the login endpoint takes no body — the signed event
 * arrives in the `Authorization: Nostr <base64>` header. The only
 * thing left worth a schema here is the signer-type enum, which the
 * server reads from a custom tag inside the event itself.
 */
import { z } from "zod";

const SIGNER_TYPES = ["extension", "nsec", "nip46"] as const;

export const SignerTypeSchema = z.enum(SIGNER_TYPES);
