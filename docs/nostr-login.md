# Nostr Login

## Overview

The app has three sign-in methods, all of which land on the same server endpoint (`POST /api/auth/nostr`) and produce the same artifact: a **NIP-98 HTTP Auth event** (kind 27235) bound to the login URL, signed by the user's Nostr key.

- **Browser extension** (NIP-07) — the extension holds the key and signs.
- **Remote signer / bunker** (NIP-46) — a mobile app (Amber, nsec.app, Damus) holds the key and signs via a relay.
- **Paste nsec** — the browser decodes the nsec and signs locally; the key is held in memory for the duration of the session and never sent to the server.

All three are shipped today and live behind a single tab picker on `/signin`.

---

## How auth works (NIP-98)

On submit, the client builds an unsigned event that looks like:

```json
{
  "kind": 27235,
  "created_at": <now_unix>,
  "content": "",
  "tags": [
    ["u", "https://arena.bitbybit.com.ar/api/auth/nostr"],
    ["method", "POST"],
    ["arena_signer", "extension" | "nip46" | "nsec"]
  ]
}
```

The active signer signs it, and the client POSTs the request to `/api/auth/nostr` with:

```
Authorization: Nostr <base64(JSON.stringify(signedEvent))>
```

Server-side, `validateNip98AuthEvent` in `lib/nostr/verify.ts` checks:

- The base64 decodes to a well-formed event with a valid Schnorr signature (`nostr-tools/pure` `verifyEvent`).
- `kind === 27235`.
- The `u` tag matches the exact request URL (`req.nextUrl.toString()`).
- The `method` tag matches the HTTP method (`POST`).
- `created_at` is within ±60 s of server time (NIP-98 replay window).
- An `["arena_signer", ...]` tag is present with one of `"extension" | "nip46" | "nsec"`. Because this tag is inside the signed event, a MITM can't rewrite it on the wire — the signer_type is tamper-evident.

On success, the route `upsert`s the `users` row (keyed by pubkey) and issues a session cookie signed with `AUTH_SECRET` (JWT via `jose`, 7-day expiry).

### Session cookie

- Production: **`__Host-session`**. The `__Host-` prefix is enforced by the browser — the cookie is rejected unless it's `Secure`, has `Path=/`, and has no `Domain` attribute. This blocks subdomain cookie injection from any future `*.bitbybit.com.ar` sibling service.
- Dev / local: plain `session`. `__Host-` requires HTTPS, which local dev doesn't have.

The cookie name is exported as `SESSION_COOKIE_NAME` from `lib/auth.ts` so routes and tests never hardcode it.

### Why NIP-98 and not NIP-42?

NIP-42 is the spec for client → relay authentication (`["AUTH", ...]` frames over a websocket). We aren't authenticating to a relay — we're authenticating to our own HTTP API. NIP-98 is the spec that covers that case: it binds the signed event to an HTTP verb and URL, gives you a `created_at` replay window out of the box, and doesn't require a challenge cookie round-trip. An earlier version of the app used a kind-22242 flow; PR #59 migrated everything to NIP-98.

---

## Method 1 — Browser extension (NIP-07)

**Entry point**: `components/auth/ExtensionSignerButton/index.tsx`.

**Flow:**

1. The button checks for `window.nostr`. If absent, it falls back to `components/auth/ExtensionUpsell` with links to Alby, nos2x, and Nostr Connect.
2. Click → `window.nostr.getPublicKey()` to confirm consent.
3. Build the unsigned NIP-98 event (see above).
4. `window.nostr.signEvent(event)` → signed event.
5. POST to `/api/auth/nostr` with the `Authorization: Nostr <base64>` header.
6. On 200, the client redirects to the post-login destination (defaults to `/explore`).

**Security**: strongest of the three. The private key never enters the app's JS context.

---

## Method 2 — Remote signer / bunker (NIP-46)

**Entry point**: `components/auth/NostrConnectPanel/index.tsx`. The relay coordination lives in `lib/nostr/nip46-login.ts`.

**Flow:**

1. The panel generates an ephemeral client keypair and opens a relay connection (defaults to `wss://relay.nsec.app`).
2. It renders either a QR (`nostrconnect://` URI) or a text field for a bunker URL the user can paste.
3. The user's mobile signer (Amber, nsec.app, Damus) scans / connects and approves the session.
4. The remote signer returns a `connect` response; the app then asks it to sign the NIP-98 event via NIP-46's `sign_event` RPC.
5. The signed event is sent to `/api/auth/nostr`.

**Timeout**: 60 s for connection, separate timeouts per RPC call. The panel retries once before failing.

**Security**: strong. The private key stays on the mobile device; the app only sees signed events.

---

## Method 3 — Paste nsec

**Entry point**: `components/auth/NsecSignerForm/index.tsx`. The signer implementation lives in `lib/signer-context.tsx` (`makeNsecSigner`).

**Flow:**

1. User pastes a bech32 `nsec1...` or hex private key.
2. `nostr-tools/nip19.decode()` extracts the 32-byte secret.
3. A local signer is created that calls `nostr-tools/pure.finalizeEvent()` on each unsigned event.
4. The signer is held in the in-memory `SignerContext` for the life of the tab. It's never written to `localStorage`, `sessionStorage`, or a cookie.
5. The NIP-98 event is signed locally and sent like the other methods.

**Security**: the weakest of the three — the key is in the page's JS context, so a malicious extension or an XSS bug would expose it. The UI makes the risk explicit before the user can proceed (password input, reveal toggle, acknowledgement checkbox).

---

## Signin page layout

`app/[locale]/(auth)/signin/signin-client.tsx` renders a single picker with three tabs (Extension / Bunker / Paste nsec) via `components/auth/SignerMethodButtons`. All three paths converge on `completeLoginWithSigner` in `lib/signer-context.tsx`, which handles the NIP-98 build + sign + POST.

---

## Server-side code

- **Route**: `app/api/auth/nostr/route.ts` — POST only. There is **no GET round-trip** any more; the challenge cookie was deleted in PR #59.
- **Validator**: `lib/nostr/verify.ts:validateNip98AuthEvent` — handles base64 decode, schema, signature, clock skew, and tag binding.
- **Rate limit**: `lib/api/handler.ts` uses `lib/api/rate-limit.ts` to bound requests per IP (in-memory by default; swap for Upstash/KV in prod via the `RateLimitStore` interface).
- **Session**: `lib/auth.ts:createSession` signs the JWT and sets the cookie via `next/headers`.

---

## Dependencies

- `nostr-tools` — `nip19`, `pure.finalizeEvent`, `pure.verifyEvent`, NIP-46 helpers.
- `qrcode.react` — renders the `nostrconnect://` QR and is also used by the landing ZapModal for invoice fallback.
- `jose` — HS256 JWT signing / verification.
