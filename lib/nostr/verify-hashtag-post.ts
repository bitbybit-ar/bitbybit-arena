import { fetchFirstMatchingEvent } from "./fetch-events";
import type { NostrEvent } from "./types";

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
 * hashtag, comparing case-insensitively. NIP-01 `t` tags are nominally
 * lowercase but participants publish from clients that don't all
 * normalize — we've seen the same hashtag appear as `pizzaday`,
 * `PizzaDay`, and `pizzaDay` from different clients on the same
 * challenge. The verification has to accept any of those.
 *
 * Two-stage strategy:
 *
 *   1. **Targeted query** — relay-side `#t` filter with the three
 *      common case variants (lowercase / uppercase / capitalized).
 *      Cheapest path; matches the canonical lowercase publishers.
 *
 *   2. **Broader fallback** — if the targeted query returns nothing,
 *      drop the `#t` filter entirely and stream the author's recent
 *      kind:1 notes, post-filtering case-insensitively. Catches the
 *      mixed-case casings (`PizzaDayXLaCrypta`, `pizzaDay`, …) that
 *      relay `#t` filters skip because they treat the value as
 *      case-sensitive bytes.
 *
 * Both stages share the same client-side predicate so a relay that
 * returns an unrelated kind:1 (or a `t` tag with a different casing
 * than we asked for) doesn't poison the result — `fetchFirstMatchingEvent`
 * keeps listening when the predicate rejects an EVENT.
 */
export async function verifyHashtagPost(
  params: VerifyHashtagParams
): Promise<VerifyHashtagResult> {
  const normalized = params.hashtag.toLowerCase().replace(/^#/, "");
  const matches = (event: NostrEvent) =>
    event.tags.some(
      (tag) => tag[0] === "t" && tag[1]?.toLowerCase() === normalized
    );

  // Stage 1: targeted query against the relay's `#t` index.
  const variants = Array.from(
    new Set([normalized, normalized.toUpperCase(), capitalize(normalized)])
  );
  const targeted = await fetchFirstMatchingEvent(
    {
      kinds: [1],
      authors: [params.authorPubkey],
      "#t": variants,
      limit: 5,
    },
    {
      relays: params.relays,
      timeoutMs: params.timeoutMs,
      predicate: matches,
    }
  );
  if (targeted) return { valid: true, proofEventId: targeted.id };

  // Stage 2: broader fallback. Relays cap kind:1 backfills, so 50 is a
  // reasonable upper bound — if the participant has tweeted more than
  // that since posting the proof, they probably also have an older
  // post we can't see anyway. The predicate keeps the helper waiting
  // for a tag-match instead of accepting the relay's first kind:1.
  const fallback = await fetchFirstMatchingEvent(
    {
      kinds: [1],
      authors: [params.authorPubkey],
      limit: 50,
    },
    {
      relays: params.relays,
      timeoutMs: params.timeoutMs,
      predicate: matches,
    }
  );
  if (fallback) return { valid: true, proofEventId: fallback.id };

  return { valid: false };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
