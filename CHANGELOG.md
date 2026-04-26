# Changelog

All notable changes to BitByBit Arena are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-04-26

Initial public release. Submitted to **Hackathon #2 "IDENTITY"** at La Crypta. Production at https://arena.bitbybit.com.ar.

This release is what the BitByBit team built across ~309 commits and ~100 merged PRs over the run-up to the hackathon. Every NIP listed below is exercised against live relays in the [judge walkthrough](docs/testing-plan.md).

### Identity & authentication (NIP-07 / NIP-19 / NIP-46 / NIP-98)

- **Three sign-in methods** all converging on the same NIP-98 HTTP Auth event (kind 27235): browser extension (Alby / nos2x / Nostr Connect), remote signer / bunker (Amber / nsec.app / Damus over a relay), and paste-nsec local signer (key held in JS context for the tab, never persisted).
- **`signer_type` is tamper-evident**: travels inside the signed envelope as a custom `["arena_signer", ...]` tag, so a MITM cannot rewrite the signer claim on the wire.
- **±30s replay window** on `created_at` — tighter than the NIP-98 default — and the event is bound to the request URL and HTTP verb via `u` / `method` tags.
- **Session as JWT** (`jose`, HS256, 7-day expiry) in `__Host-session` cookie in production (`session` in dev — `__Host-` prefix requires HTTPS). `AUTH_SECRET` is required at boot in production; the module throws on load if it's missing.
- **Onboarding consent flow** for paste-nsec — explicit acknowledgement that the key lives in the page's JS context for the session.
- **Auto-create user** on first Nostr login. Async kind:0 metadata hydration from default relays (best-effort, 2.5s timeout).

### Challenges

- **5 challenge types**: `one_time`, `streak`, `competition`, `race`, `creative`.
- **kind:30100** parameterized replaceable Challenge Definition event published on create, namespaced by per-challenge `d`-tag slug.
- **Tags** (free-form, lowercase / alphanumeric+hyphens, max 10 per challenge) carried both on the kind:30100 event as `t` tags and in the DB for fast filtering. Discovery via `GET /api/tags/popular`.
- **Creator can update** the challenge by re-publishing the same `d`-tag (status changes, edits).
- **Soft-delete by creator** when no active participants exist.

### Discovery & explore

- **Five sort options**: Newest (default), Trending, Ending soon, Most participants, Most active.
- **Trending formula**: `joins + 2 × completions` over the last 7 days. Completions weigh double because actually doing the thing is a stronger signal than joining.
- **Follow-boosted feed (NIP-02 kind 3)**: challenges from creators you follow float to the top of Explore. **Only following** toggle scopes the result set entirely to followed creators.
- **Filters** by status, type, tag, verification method.
- **Cursor-based pagination** on every list endpoint.

### Verification & checkpoints

Each challenge (and each checkpoint) carries an ordered `verification_methods` array; participants pick a path when multiple are enabled.

- **`creator_approval`** — text + optional photo proof, manual review by the creator.
- **`automatic`** — honour-system, auto-approves on submit.
- **`nostr_action` (NIP-25)** — participant likes a creator-pinned target event from any Nostr client; the server fetches the kind:7 reaction from relays, verifies signature, and auto-approves with `proof_event_id = <like event id>`.
- **`nostr_hashtag` (NIP-01 `t` tag)** — participant publishes a kind:1 note carrying the challenge's `#t` from any client; the server finds it, multi-case fallback, auto-approves.
- **Partial unique index** on `completions(challenge_id, user_id, proof_event_id) WHERE proof_event_id IS NOT NULL` prevents the same event from counting twice.

**Checkpoints** (1–20 sub-tasks per challenge):

- **`none` / `sequential` / `parallel`** modes. Sequential blocks step N+1 until N is approved (server-enforced, returns `400 "Complete the previous checkpoint before this one"`).
- **Per-checkpoint verification method** — one checkpoint can be `creator_approval`, the next `nostr_action`, etc.
- **Rejection is the only retry-able state** — the row upserts and `reject_reason` is cleared on resubmit. Approved is terminal; pending blocks duplicate submits with `400 "You already submitted this checkpoint — waiting for review"`.
- **Atomic create** via Drizzle's `db.batch([...])` (Neon's HTTP driver doesn't support `transaction()`, but `batch` runs as an implicit transaction with a pre-generated parent UUID).
- **`participants.progress` mirrors the count** of approved `checkpoint_completions` (count, not increment, so concurrent approvals cannot double-bump).

### Image proofs (Blossom BUD-01/02 + NIP-92)

- Photo uploads to a Blossom server: client SHA-256s the file, signs a short-lived **kind:24242** auth event, `PUT`s the bytes, gets back a content-addressed URL.
- The URL is mirrored into the kind:7101 completion event with a sibling **NIP-92 `imeta`** tag carrying sha256 / size / mime, so recipients can verify the blob from the event alone — no Arena lookup required.
- Default server `NEXT_PUBLIC_BLOSSOM_SERVER` (fallback `https://blossom.primal.net`). Swap per-deployment; blobs are content-addressed, so the sha256 still resolves on any Blossom mirror.

### Badges (NIP-58)

- **kind:30009** Badge Definition published at challenge creation when a badge is defined (lazy-published on first award if the initial publish failed).
- **kind:8** Badge Award published per recipient when the creator awards badges. `a`-tags the kind:30009 definition (not the kind:30100 challenge — fixed in Phase A).
- **kind:30008** Profile Badges published when a recipient clicks **Accept on Nostr**. Critically, the merge-preserve logic fetches the user's prior 30008, parses out existing `(a, e)` pairs, deduplicates against the new pair, and re-publishes the merged set — so accepting an Arena badge doesn't clobber badges from other apps. Concurrent accepts are serialised on the client to avoid the "two tabs each fetch the latest" race.
- **Optional badge image** uploaded via Blossom, included in the kind:30009 with both `image` and `imeta` tags.

### Lightning rewards (NIP-57 + NIP-75)

- **Auto-published kind:9041 Zap Goal (NIP-75)** for every challenge with `prize_amount_sats > 0`. Without the goal on relay, supporters have nothing to zap. If publish fails (signer rejected, relay outage), a creator-only **Republish zap goal** button appears on the detail page.
- **Supporter funding loop** via the **Fund this pot** modal: signs a NIP-57 kind:9734 zap request that `e`-tags the goal event, resolves the creator's `lud16` to LNURL-pay, fetches a BOLT11 invoice with the signed request attached, pays via WebLN or QR + NWC-polling fallback.
- **Live progress** in two places: a 45s-cached server snapshot at `GET /api/challenges/[id]/zap-goal-progress` for Explore card progress bars, and a long-lived relay subscription (`useZapGoalProgress`) on the detail page with a "Recent zappers" panel that updates without a reload.
- **Creator payout flow** on **Distribute rewards**: server computes winners per `prize_distribution` rule (`first_to_complete` / `split` / `tiered` / `none`), client-side WebLN-or-QR payment loop per winner, then publishes a **kind:30101 Challenge Result** event with winner / completer / stats tags and stamps `rewards_paid_at` only on the explicit `{all_winners_paid: true}` PATCH.
- **Tiered renormalisation**: when fewer than 3 completers exist, the 50/30/20 weights re-scale over the available winners (the full pot is always paid out).
- **`retained` flag**: if the creator would receive a share, it's marked retained and not paid out (the creator keeps their own sats — the UI shows "X sats retained by creator").
- **No invoices cross our server.** No sats sit on our server. No custody. The only server-side Lightning surface is `POST /api/zap/status` which polls Nostr Wallet Connect to confirm settlement on QR-fallback flows.

### Profile, settings, notifications

- **Settings page** with three sections: Profile (display name, username, avatar, about, lightning address — all backed by kind:0 metadata), Preferences (locale + theme), Danger Zone.
- **Sync from relays** fetches latest kind:0 metadata; **Publish to Nostr** ships a fresh signed kind:0 event preserving any fields Arena doesn't manage (`nip05`, `website`, `banner`, …).
- **Per-section save sentinels** — toggling Notifications doesn't disable the Profile form's submit button, and vice versa.
- **Per-type notification preferences** stored as a jsonb `notification_prefs` map. Five emission paths: `challenge_joined`, `completion_submitted`, `completion_verified` (split into `_approved` / `_rejected` at render time), `prize_awarded`, `badge_earned`. Disabled types are silently skipped — no DB write, no bell entry.
- **Notification bell** polls every 30s, caps the unread badge at `9+`, click-through routes to the challenge detail with locale prefix preserved, **Mark all as read** flips every unread row in one query.
- **Self-triggered events skipped** — joining your own challenge doesn't ping yourself, and a retained creator prize doesn't fire `prize_awarded`.
- **Soft-delete account** via `DELETE /api/profile`: scrubs PII (`username` → `deleted_<shortId>`, `display_name` → `[deleted]`, nulls avatar / about / lightning_address / nostr_metadata), stamps `deleted_at`, clears the session cookie. The row is kept so existing FK references from challenges, participants, completions, badges, and notifications stay intact.

### Internationalization

- **Spanish (default) + English** via next-intl with `[locale]` routing.
- **Locale-aware navigation** — every internal `Link` preserves the locale prefix.
- **Auto-detect from `Accept-Language`** with a one-year `NEXT_LOCALE` cookie persistence.
- **Number / date formatting** follows the active locale (Spanish uses comma for decimals and dot for thousands, English the opposite).
- **Notification bodies** render from i18n keys; the English copy stored on the row is the fallback if a key is ever missing.

### UI & design system

- **Bottom-nav** with two tabs (Explore + My Challenges); Create and Settings reachable from buttons / avatar menu.
- **`ceramic-card` mixin** as the single source for elevated surface styling — solid backgrounds, no glassmorphism.
- **Block, Bubble, PixelIcon, PixelDissolve, BlockTower** — custom decorative components in `components/common/` that carry the BitByBit "stacked blocks" identity.
- **Light / Dark / System** theme via `next-themes`, persisted in `localStorage`.
- **Custom SVG icon set** in `components/icons/` (no icon-library dependency).
- **Reduced-motion respected** — every drift / pulse / spotlight animation collapses to static under `@media (prefers-reduced-motion: reduce)`.

### Security

- **CSP nonce-based** with `'strict-dynamic'`. Per-request nonce generated in `proxy.ts`, propagated to Next.js's framework via the `x-nonce` request header so every inline hydration script is stamped. No `'unsafe-inline'` on `script-src`.
- **Trusted Types in Report-Only mode** (`require-trusted-types-for 'script'`) — surfaces unguarded DOM-sink assignments without breaking the page. Codebase audit at release time: zero `dangerouslySetInnerHTML`, `innerHTML =`, `document.write`, `insertAdjacentHTML`, `eval`, `new Function` across `app/`, `components/`, `lib/`.
- **Static security headers** — HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **Rate limiting** per IP via `lib/api/rate-limit.ts` (in-memory by default; swappable for Upstash/KV via the `RateLimitStore` interface). Auth tier: 60 req/min.
- **`__Host-session` cookie** in production — Secure, Path=/, no Domain, blocking subdomain cookie injection.
- **No SQL string interpolation** — all queries via Drizzle.
- **Soft-delete preserves FK integrity** rather than dropping rows that public Nostr events still reference.

### Infrastructure

- **Drizzle ORM** + Neon serverless Postgres (`@neondatabase/serverless`) with lazy `getDb()` connection.
- **8 tables**: users, challenges, challenge_checkpoints, participants, completions, checkpoint_completions, badges, notifications.
- **24 API route files** under `app/api/`, all wrapped by a shared `apiHandler` producing a consistent `{ success, data | error }` envelope.
- **OpenAPI 3.1 spec** at [`docs/openapi.yaml`](docs/openapi.yaml) covering every route — 36 operations across 25 paths. Reader's guide at [`docs/api.md`](docs/api.md). Lints clean against `redocly`.
- **CI** on every PR + push to main: typecheck, lint, unit tests, integration tests against a Neon test branch, production build. Post-merge `migrate` job applies migrations to the production branch via `DATABASE_URL_DIRECT`.
- **Concurrency-gated CI** (`ci-shared-test-db` group, `cancel-in-progress: false`) so two PRs can't race the integration suite's TRUNCATE between rebuilds.
- **17 documentation files** in `docs/` — architecture, Nostr event design, login flow, proof-of-completion, prize distribution, checkpoints, deploy guide, testing strategy, judge walkthrough, and more.

### NIPs implemented

NIP-01, NIP-02, NIP-07, NIP-19, NIP-25, NIP-46, NIP-57, NIP-58, NIP-75, NIP-92, NIP-98, plus Blossom BUD-01/02.

Custom event kinds: `30100` (challenge definition), `7100` (challenge join), `7101` (completion submission), `30101` (challenge result), `kind:24242` (Blossom upload auth). Kind 30100 overlaps with the unmerged [NIP-113](https://github.com/nostr-protocol/nips/pull/1508) (Activity Events) proposal and will be revisited if that NIP is accepted.

### Documentation

Docs in `docs/` are the source of truth for architecture decisions, Nostr event design, and individual flows. The full audit pass at release time aligned every doc with shipped behaviour.

### Credits

- **Anix** — lead dev, architecture
- **Llopo** — backend, Lightning integration
- **Wander** — UX, frontend
- **Leon** — PM, hackathon coordination

Built at La Crypta, the Bitcoin community in Argentina that hosted both BitByBit hackathons.

Sibling project: [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) (Hackathon #1 FOUNDATIONS — Lightning).

[1.0.0]: https://github.com/bitbybit-ar/bitbybit-arena/releases/tag/v1.0.0
