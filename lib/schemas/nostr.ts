/**
 * Schemas for raw Nostr protocol shapes (NIP-01 events). Used by the
 * server-side verifier to safely narrow `unknown` JSON into a typed
 * `NostrEvent` before doing any cryptographic work — no `as` casts at
 * the boundary, no chance of the verifier crashing on a malformed
 * event.
 */
import { z } from "zod";
import { Hex64Schema, NostrPubkeySchema } from "./primitives";

/**
 * Bare-minimum NIP-01 event shape: id + pubkey + sig as 64-hex,
 * created_at as a Unix timestamp, kind as a non-negative integer,
 * content as a string, tags as a string[][]. Permissive on tag
 * contents (each tag is an array of strings) since the schema lives
 * upstream of any tag-specific consumer.
 */
export const NostrEventSchema = z.object({
  id: Hex64Schema,
  pubkey: NostrPubkeySchema,
  sig: Hex64Schema,
  created_at: z.number().int().nonnegative(),
  kind: z.number().int().nonnegative(),
  content: z.string(),
  tags: z.array(z.array(z.string())),
});
