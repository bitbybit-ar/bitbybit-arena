import { fetchFirstMatchingEvent } from "./fetch-events";

export interface VerifyHashtagParams {
  authorPubkey: string;
  hashtag: string;
  relays?: string[];
  timeoutMs?: number;
}

export interface VerifyHashtagResult {
  valid: boolean;
  proofEventId?: string;
}

/**
 * Verify that `authorPubkey` has published a kind:1 note tagging the given
 * hashtag. Per NIP-12 the canonical form is lowercase, but some clients
 * publish with mixed case, so we query both variants on the relay and do a
 * case-insensitive match on the returned event's `t` tags.
 */
export async function verifyHashtagPost(
  params: VerifyHashtagParams
): Promise<VerifyHashtagResult> {
  const normalized = params.hashtag.toLowerCase().replace(/^#/, "");
  // Query variants covers clients that don't normalize to lowercase.
  const variants = Array.from(
    new Set([normalized, normalized.toUpperCase(), capitalize(normalized)])
  );

  const event = await fetchFirstMatchingEvent(
    {
      kinds: [1],
      authors: [params.authorPubkey],
      "#t": variants,
      limit: 1,
    },
    { relays: params.relays, timeoutMs: params.timeoutMs }
  );

  if (!event) return { valid: false };

  const hasMatchingTag = event.tags.some(
    (tag) => tag[0] === "t" && tag[1]?.toLowerCase() === normalized
  );
  if (!hasMatchingTag) return { valid: false };

  return { valid: true, proofEventId: event.id };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
