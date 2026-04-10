import { fetchFirstMatchingEvent } from "./fetch-events";

export interface VerifyLikeParams {
  likerPubkey: string;
  targetEventId: string;
  relays?: string[];
  timeoutMs?: number;
}

export interface VerifyLikeResult {
  valid: boolean;
  proofEventId?: string;
}

/**
 * Verify that `likerPubkey` has published a NIP-25 kind:7 reaction
 * tagging `targetEventId`. Returns the matched event id on success.
 */
export async function verifyLikeForTarget(
  params: VerifyLikeParams
): Promise<VerifyLikeResult> {
  const event = await fetchFirstMatchingEvent(
    {
      kinds: [7],
      authors: [params.likerPubkey],
      "#e": [params.targetEventId],
      limit: 1,
    },
    { relays: params.relays, timeoutMs: params.timeoutMs }
  );

  if (!event) return { valid: false };

  // Defensive: fetchFirstMatchingEvent already verified the signature,
  // but confirm the e-tag actually matches the target before trusting it.
  const hasMatchingTag = event.tags.some(
    (tag) => tag[0] === "e" && tag[1] === params.targetEventId
  );
  if (!hasMatchingTag) return { valid: false };

  return { valid: true, proofEventId: event.id };
}
