# API reference

The HTTP API is described as an OpenAPI 3.1 spec at
[`docs/openapi.yaml`](./openapi.yaml). It is the single source of truth
for the routes under `app/api/` — request bodies, response envelopes,
error codes, and auth requirements all live there.

## Viewing the spec

The YAML lints clean against the Redocly rule set and can be loaded by
any OpenAPI 3.1 viewer:

- Paste the file contents into <https://editor.swagger.io>.
- Or render it locally:

  ```bash
  npx @redocly/cli preview-docs docs/openapi.yaml
  ```

- Lint it the same way the project does:

  ```bash
  npx @redocly/cli lint docs/openapi.yaml
  ```

There is no in-app `/api/docs` viewer; for the hackathon the YAML plus
this pointer is enough.

## Auth model

Two security schemes appear in the spec. They cover different parts of
the lifecycle:

- **`nostrAuth`** — NIP-98 HTTP Auth (kind 27235). Used **only** by
  `POST /api/auth/nostr` to exchange a signed Nostr event for a
  session. Format: `Authorization: Nostr <base64(JSON.stringify(event))>`.
  Bound to URL + method via `u`/`method` tags and a ±30 s `created_at`
  window (`CLOCK_SKEW_SECONDS` in `lib/nostr/verify.ts`).
- **`cookieAuth`** — the httpOnly session cookie issued by the login
  endpoint. `__Host-session` in production (Secure, Path=/, SameSite=Strict,
  no Domain), `session` in dev. JWT, 7-day expiry. Required on every
  route that mutates state or reads user-specific data.

Public read routes (challenge list/detail, participants, popular tags,
zap-goal-progress) advertise `security: []` and accept anonymous
callers.

## Response envelope

Every response is wrapped:

```jsonc
// 2xx
{ "success": true,  "data": <payload> }
// 4xx / 5xx
{ "success": false, "error": "<message>", "code": "<machine-readable>" }
```

The error `code` enum lives in `lib/api/errors.ts`. The client maps each
code to a localised string in `messages/{es,en}.json#errors.codes` and
falls back to the English `error` text for codes it doesn't yet know.

## Pagination

Cursor-based, returned as `{ items, nextCursor }`. Depending on the
endpoint, `nextCursor` is an ISO-8601 timestamp, a UUID, or `null` when
there are no more rows. Defaults: `limit=20`, capped at `50` (or `100`
for `/api/tags/popular`).
