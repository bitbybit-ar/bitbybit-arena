import { verifyEvent } from "nostr-tools/pure";
import { NostrEventSchema } from "@/lib/schemas/nostr";
import type { NostrEvent } from "./types";

/**
 * Verify a Nostr event signature per NIP-01.
 *
 * Delegates to `nostr-tools/pure`'s `verifyEvent`, which is the
 * reference implementation used by Damus, Snort, Iris and the
 * NIP-46 bunker stack. Replaced a hand-rolled
 * `JSON.stringify([0,pubkey,...])` + `schnorr.verify` because:
 *   1. NIP-01 mandates a specific UTF-8 escape policy that
 *      `JSON.stringify` doesn't fully respect (e.g. `\u2028`,
 *      `\u2029`, surrogate halves), so any kind:1 event with one
 *      of those characters would silently fail our verifier while
 *      passing every other client's.
 *   2. nostr-tools has been audited and battle-tested against the
 *      whole relay/signer ecosystem; the hand-roll is one
 *      serialization edge case away from a hard-to-debug bug.
 */
export function verifyNostrEvent(event: NostrEvent): boolean {
  try {
    return verifyEvent(event);
  } catch {
    return false;
  }
}

/**
 * Reason for a NIP-98 HTTP auth event rejection. Kept narrow on
 * purpose — these strings are safe to surface in the 400 response
 * because none of them leak any secret; they only tell the caller
 * *which* check a presumably-legitimate client tripped.
 */
export type AuthEventRejection =
  | "schema"
  | "kind"
  | "clock"
  | "content"
  | "url"
  | "method"
  | "signature";

export type AuthEventValidation =
  | { ok: true; event: NostrEvent }
  | { ok: false; reason: AuthEventRejection };

/**
 * NIP-98 (HTTP Auth) constants.
 *
 * - kind 27235 is the spec-defined kind for HTTP-bound auth events.
 *   We previously used kind 22242 (NIP-42) which is reserved for
 *   client→relay AUTH and is technically the wrong protocol for
 *   HTTP login — see github.com/nostr-protocol/nips/blob/master/98.md.
 * - The ±60s clock window matches the spec's recommendation. Tighter
 *   than the NIP-42 ±300s we used to allow, but legitimate signers
 *   (NIP-07 extensions, nostr-tools, NIP-46 bunkers) all stamp the
 *   current time accurately and 60s is the canonical window other
 *   NIP-98 servers (Blossom, Snort, nostr.build) enforce.
 */
const NIP98_KIND = 27235;
const CLOCK_SKEW_SECONDS = 60;

interface RequestContext {
  /** Absolute URL of the incoming request (origin + path + query). */
  url: string;
  /** HTTP method of the incoming request, in upper-case. */
  method: string;
}

function findTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

/**
 * Compare two URLs as NIP-98 prescribes: the `u` tag MUST match the
 * absolute URL of the request including any query string. We ignore
 * trailing-slash differences and normalise the scheme/host case so a
 * proxy that lower-cases the host doesn't reject otherwise-valid
 * events.
 */
function urlsMatch(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.protocol === ub.protocol &&
      ua.host.toLowerCase() === ub.host.toLowerCase() &&
      ua.pathname.replace(/\/+$/, "") === ub.pathname.replace(/\/+$/, "") &&
      ua.search === ub.search
    );
  } catch {
    return false;
  }
}

/**
 * Validate a NIP-98 HTTP authentication event (kind 27235).
 *
 * Accepts `unknown` and shape-checks via NostrEventSchema first so
 * the route handler can hand us untyped JSON without needing a cast
 * — a malformed payload falls into the `schema` branch here rather
 * than crashing inside verifyNostrEvent. Then, in order:
 *
 *   1. kind === 27235
 *   2. created_at within ±60 s of now
 *   3. content is the empty string (NIP-98 §"Validation")
 *   4. `["u", <abs URL>]` tag matches the request URL
 *   5. `["method", <verb>]` tag matches the request method
 *   6. Schnorr signature verifies
 *
 * Returns a discriminated result so the route handler can surface
 * *which* check failed in both the server log and the 400 body —
 * critical for debugging a login issue we can't reproduce locally.
 *
 * Note: the optional `["payload", <sha256(body)>]` tag is not checked
 * here because our login endpoint takes no body. Add a payload check
 * when extending NIP-98 auth to endpoints that send a body.
 */
export function validateNip98AuthEvent(
  input: unknown,
  ctx: RequestContext
): AuthEventValidation {
  const parsed = NostrEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "schema" };
  const event = parsed.data;

  if (event.kind !== NIP98_KIND) return { ok: false, reason: "kind" };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "clock" };
  }

  if (event.content !== "") return { ok: false, reason: "content" };

  const uTag = findTag(event, "u");
  if (!uTag || !urlsMatch(uTag, ctx.url)) {
    return { ok: false, reason: "url" };
  }

  const methodTag = findTag(event, "method");
  if (!methodTag || methodTag.toUpperCase() !== ctx.method.toUpperCase()) {
    return { ok: false, reason: "method" };
  }

  if (!verifyNostrEvent(event)) return { ok: false, reason: "signature" };

  return { ok: true, event };
}
