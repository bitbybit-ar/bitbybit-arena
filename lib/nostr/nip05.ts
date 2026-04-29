/**
 * NIP-05 verifier.
 *
 * The `nip05` field on a kind:0 event is a *claim* — the user signed
 * an event saying "my handle is alice@example.com" but anyone can
 * write any string there. To trust it we have to ask `example.com`
 * whether the claim is mutual: NIP-05 specifies that
 * `https://<domain>/.well-known/nostr.json?name=<localpart>` returns
 *
 *     { "names": { "<localpart>": "<hex_pubkey>", … } }
 *
 * and the verification only holds when the pubkey on the right side
 * matches the pubkey of the kind:0 author.
 *
 * `_@domain` is the "naked domain" form — `name=_` is what the spec
 * uses for the apex / no-localpart case. We treat a bare `domain`
 * the same way for compatibility with clients that emit either form.
 */

const NIP05_LIKE_RE = /^[^@\s]+(?:@[^@\s/]+)?$/;
const HEX_64_RE = /^[0-9a-f]{64}$/i;

export interface VerifyNip05Options {
  /** Optional `AbortSignal` so callers can cancel the round-trip on
   *  unmount. The fetch is one HTTP request, so a sensible page-level
   *  timeout falls in the 4–6s range — much longer than that and the
   *  user has already given up on the verified check. */
  signal?: AbortSignal;
  /** Override the network call entirely. Used by the test suite — the
   *  helper otherwise accepts only the global `fetch` and exercises
   *  the real CORS / DNS path. */
  fetchImpl?: typeof fetch;
}

/**
 * Resolve a NIP-05 identifier and confirm the domain returns the
 * expected pubkey. Returns `false` on any failure path — network
 * error, non-2xx, malformed JSON, missing localpart, mismatch.
 *
 * Callers should treat this as a soft signal (no checkmark on
 * `false`) rather than a hard ban — domains go down, CORS gets
 * misconfigured, and the user's profile is still legitimate even
 * when their NIP-05 host can't be reached this minute.
 */
export async function verifyNip05(
  nip05: string,
  expectedPubkey: string,
  options: VerifyNip05Options = {}
): Promise<boolean> {
  const trimmed = nip05.trim();
  if (!NIP05_LIKE_RE.test(trimmed)) return false;
  if (!HEX_64_RE.test(expectedPubkey)) return false;

  const [rawLocal, rawDomain] = trimmed.includes("@")
    ? trimmed.split("@", 2)
    : ["_", trimmed];
  const localpart = rawLocal.toLowerCase();
  const domain = rawDomain?.toLowerCase();
  if (!localpart || !domain) return false;

  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(
    localpart
  )}`;
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      signal: options.signal,
      // Standard CORS request — the spec mandates the well-known
      // endpoint serve `Access-Control-Allow-Origin: *`. Hosts that
      // don't send the header simply fail closed for us, which is
      // the safest default.
      mode: "cors",
      credentials: "omit",
    });
  } catch {
    return false;
  }

  if (!response.ok) return false;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return false;
  }

  if (!body || typeof body !== "object") return false;
  const names = (body as { names?: Record<string, unknown> }).names;
  if (!names || typeof names !== "object") return false;
  const claimed = names[localpart];
  if (typeof claimed !== "string") return false;

  return claimed.toLowerCase() === expectedPubkey.toLowerCase();
}
