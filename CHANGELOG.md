# Changelog

All notable changes to BitByBit Arena are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-04-29

Patch release. Fixes post-launch UX bugs around challenge completion, verification-method handling, and reward flows, plus a focused refactor of the explore-detail page and a new public profile surface.

### Fixed

- **Approval flow no longer shows "enviando badge…" toast for challenges without a badge.** Creators approving completions on prize-less challenges saw a misleading "sending badge on Nostr" message even though there was nothing to send. The award call is now gated on the challenge actually having a badge defined.
- **`nostr_hashtag` challenges have a participant verify button.** The page only rendered a verify affordance for `nostr_action`; hashtag-verified challenges had no UI to trigger the relay check, so participants could publish the required note from any Nostr client and have nothing happen on Arena.
- **Hashtag link now opens a working hashtag feed.** The challenge info block linked to `njump.me/t/<tag>`, which 404s — njump only routes NIP-19 entities, not hashtags. Replaced with `nostr.band/?q=%23<tag>`.
- **Multi-method challenges no longer 400 on Nostr verify.** The verify-button click was sending an empty body and relying on the `/completions` route to auto-pick the method, which only works when the challenge has a single allowed method. With more than one allowed method the route returned the generic `bad_request` ("That request didn't go through. Please check your input."). The Nostr verify section, the manual textarea, and `handleSubmitProof` now pass `method` explicitly per submission surface.
- **Multi-method checkpoints now surface every applicable proof path on the participant side.** `CheckpointCompletionSection` used to switch between the manual form and the `nostr_action` verify button by reading `verification_methods[0]`, so a checkpoint configured with `[creator_approval, nostr_hashtag]` always rendered the manual form and never offered the hashtag verify button. The component now renders one form per allowed method (manual + nostr-action + nostr-hashtag), with a section label for each when more than one applies, and `handleCompleteCheckpoint` accepts the chosen `method` so the API gets an unambiguous body. `CheckpointSubmitForm` gained a third `mode: "nostr-hashtag"` discriminator that mirrors the existing `nostr-action` button.
- **Integration test for the dual-method hashtag flow updated** to expect the `pending` status `decideAutoApprove` returns when `creator_approval` is in the configured set (was asserting `approved`, which caught the new behavior in CI).
- **`verifyHashtagPost` now matches mixed-case hashtag posts.** Participants on the same challenge publish from clients that don't all normalize `t` tags — for the `PizzaDayXLaCrypta` challenge we observed the same hashtag arriving as `pizzadayxlacrypta`, `PizzaDayXLaCrypta`, and `PIZZADAYXLACRYPTA` from different posters. Most relays treat NIP-01 `#t` filter values as case-sensitive bytes, so only the three exact case variants the verifier explicitly enumerated (lowercase / uppercase / capitalized) were ever found, and any other casing (e.g. `PizzaDayXLaCrypta`) was missed. Matching is per-tag case-folded only — the comparison still checks for the *full* hashtag, not a substring. The verifier now runs a two-stage strategy: a fast targeted `#t` query first (cheap path for canonical lowercase posters), then a broader fallback that drops the `#t` filter, streams the author's recent kind:1 notes, and post-filters case-insensitively against the configured hashtag. Both stages share a client-side predicate so a relay returning a non-matching kind:1 doesn't poison the result. `fetchFirstMatchingEvent` gained an optional `predicate` arg that keeps the helper listening when an event fails the post-filter (instead of resolving on the first relay event regardless of fitness).
- **One-shot challenges no longer keep showing proof-submission CTAs after a pending submission.** With the new "Nostr proof + creator review" combo, a participant's verified hashtag post lands `pending` and `participants.status` stays `active` — the existing `!completed` gate on both `NostrVerifySection` and the manual textarea didn't flip, so the page kept inviting submissions that couldn't move the needle. Added a `canSubmitMore` field to `deriveMyProgress`: false on `completed` OR (one-shot challenge AND has a non-rejected submission). Multi-step challenges keep the existing behavior because each submission still counts as a separate step.
- **Completion banner copy.** "¡Completaste el desafío! Esperá la revisión del creador o un nuevo zap del premio." kept showing the trailing review/zap hint even after the proof was approved. Banner now just confirms the completion in both locales.
- **Achievement card now links to the user's Nostr profile after acceptance.** Once the kind:30008 acceptance is published, the participant's most useful destination is their public profile — clicking the card on `/my-challenges` → Achievements opens `/profile/<pubkey>` (replacing the previous always-routes-to-challenge behavior). Pre-acceptance the card still routes to the challenge detail.
- **Creator-as-participant badge gap.** When the creator participated in their own challenge and `decideAutoApprove` auto-completed their submission (`creator === submitter && allowed.includes("creator_approval")`), the row landed `approved` directly — but the badge-issuance flow only ran from the manual approve path, so the creator never got a `badges` row, never received the `badge_earned` notification, and never showed up in `/my-challenges` → Achievements. The challenge-detail client now self-issues the badge whenever the response comes back `status: "approved"` and the viewer is the challenge creator (`maybeSelfAwardBadge`); the existing `awardBadgeToUser` handles the kind:8 publish + DB row insertion. The award route also stops filtering the creator out of the `badge_earned` notification list — self-pings are useful here, and per-type opt-out via `notification_prefs` covers anyone who finds them noisy.

### Changed

- **Verification-method combination rules tightened.** Creators can now mix `creator_approval` with one or both Nostr methods (`nostr_action`, `nostr_hashtag`); when `creator_approval` is part of the configured set, Nostr proofs verify automatically against the relays but land as `pending` for the creator to approve manually instead of auto-approving. `automatic` (honor system) is now treated as exclusive — selecting it clears any other selection (and vice versa) in both the challenge-level and per-checkpoint editors. Schema validation enforces the rule on create + update for stragglers; the verification tooltip and i18n copy were rewritten to describe the new semantics.
- **`shouldAutoApprove` replaced by `decideAutoApprove`** in `lib/api/verification-methods.ts`. The new helper takes the full allowed-methods list so the auto-approve decision can account for "Nostr proof + creator review" combos. Both completion routes (`/api/challenges/[id]/completions` and `/api/challenges/[id]/checkpoints/[id]/complete`) call it after the per-method verification step. The unit suite was extended to cover the full decision matrix (single-method, dual-method, creator-as-submitter, all four method combinations).
- **Refactor: `app/[locale]/(app)/explore/[id]/challenge-client.tsx` split into siblings.** The page component had grown past 3,000 lines. Types, pure helpers, the `AvatarStack` subcomponent and the new `NostrVerifySection` moved to dedicated files (`types.ts`, `helpers.ts`, `AvatarStack.tsx`, `NostrVerifySection.tsx`). Pure code-move, no behavior change. Main file now ~2,700 lines.

### Added

- **`proofPendingReview` toast** surfaces when a Nostr proof verifies but the creator still has to approve it (the new "creator_approval + nostr_*" combo). Translated in `messages/es.json` and `messages/en.json`.
- **Public profile page at `/profile/[pubkey]`.** Shows the user's display name, username, avatar, about, lightning address, plus a grid of every NIP-58 badge currently associated with that pubkey — including badges earned outside Arena. The grid runs a two-stage relay query (kind:8 awards p-tagging the user, then dereferences each `a-tag` to kind:30009 for image/name/description) with mid-stream definition resolution so late-arriving awards still resolve. Includes a "Send a zap" button that opens the participant's `lightning:` URI for any wallet handler, a copyable lightning address chip, and an external "View on njump.me" link. Soft-deleted users (`users.deleted_at`) surface as 404; pubkeys that never logged into Arena render a thin shell driven entirely by the relay-fetched badges, so participant-only profiles still link meaningfully.
- **"Profile" link in the navbar avatar menu** — opens `/profile/<my-pubkey>` for the signed-in user. Sits above Settings / Sign out.
- **Avatars are navigable to profiles.** The `Avatar` primitive accepts an optional `pubkey` prop; when set it renders as a `<Link>` to `/profile/<pubkey>`. Decorative avatars (`alt=""`) and roster popups that intercept the click stay non-navigable, so existing manage-tab flows aren't redirected. Username links inside the manage-tab roster popup also moved from `njump.me/<pubkey>` to the local `/profile/<pubkey>`. Coverage extended to the General-tab Participants stack (via `AvatarStackItem.pubkey`) and the Manage-tab "More participants" rows — every static avatar surface on the challenge detail page now links to the public profile, while the click-to-open-modal stacks (General-tab Completaciones + Manage-tab Completions) preserve their existing popup behavior.

### Profile page polish (1.0.1 follow-ups)

- **Layout pass.** Avatar moved to the left of the identity column; display name → NIP-05 → about → action buttons stack to its right. Badges hint reworded for the public surface (third-person, no second-person ownership claims) so a viewer who isn't the profile owner reads it correctly. Both locales updated.
- **NIP-05 row** replaces the previous `@username` / truncated-pubkey lines under the display name. The address is fetched client-side from the user's kind:0 metadata; a copy button next to it is hidden by default and fades in on hover or `:focus-within`.
- **NIP-05 verification round-trip.** New `verifyNip05` helper resolves `https://<domain>/.well-known/nostr.json?name=<localpart>` and confirms the returned pubkey matches the kind:0 author before showing a green checkmark. Anything that doesn't return `true` (mismatch, network error, malformed JSON, missing localpart, `Access-Control-Allow-Origin` not set) renders as plain text — same convention Damus / Snort / Coracle use. Verification fetch shares the page's `AbortController` so an unmount cancels it. 10 unit tests cover happy path, mismatch, naked-domain (`example.com` → `name=_`), case-insensitive matching, 404, network rejection, malformed JSON, missing `names`, missing localpart, and malformed input rejected without a network call.
- **QR icon** in the header's top-right opens a new modal with two stacked sections: pubkey (always present, scannable QRCodeSVG + copy button) and lightning address (only when on file). The truncated pubkey + copyable lightning chip moved out of the always-visible header into this modal.
- **Zap and "Ver en njump.me" buttons** wear the platform's ceramic look (`@include ceramic-surface` for the secondary primary, ceramic outline for the alt). Implemented as plain `<a>` tags because both targets are non-internal (`lightning:` URI + external https) and next-intl's `Link` (which Button wraps) is for locale-aware in-app routing.
- **Avatar fallback initial** when `avatar_url` is absent — same purple-tinted disc the platform `Avatar` primitive uses for its initial fallback, with `role="img"` + `aria-label` for screen readers.
- **Brand purple Nostr ring** on the avatar (`2px solid $color-nostr` + `box-sizing: border-box`) so every avatar across the app reads as a Nostr identity.
- **Navbar offset.** The page padding-top now uses `calc($navbar-height + $spacing-32)` (and `+ $spacing-16` on mobile) — same recipe `/explore`, `/my-challenges`, and `/settings` use — so the avatar isn't sitting under the fixed navbar. The earlier `$spacing-48` value didn't account for the navbar's 60px height.
- **Desktop row layout.** The avatar-on-the-left layout was previously gated on `@include tablet`, which is the 768-1023 band only — at desktop width (1024+) the layout fell back to the column-stacked mobile shape. Switched to `@include tabletAndUp` so any non-mobile viewport gets the row layout.
- **QR modal interior** now reads like the rest of the platform's modals: each section uses `@include ceramic-card` (matching `FundPotModal` / `ZapModal` stacked-card pattern), the QR value wears a soft surface chip with a 1px border, and the QR codes themselves carry a thin border for contrast on dark mode.

### Under consideration (not yet decided)

- Whether to require at least one badge field at challenge creation, or keep prize-less challenges as a first-class option with distinct UI throughout the approval/completion flow.

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

### Share on Nostr

A reusable cross-flow feature that lets the user broadcast a kind:1 note about what they just did in Arena to the wider Nostr network. Pre-filled, editable, and signed client-side.

- **Four trigger contexts**, each surfaced through `ShareOnNostrModal`:
  - `challenge-created` — after a creator publishes a new challenge (`CreateChallengeForm`).
  - `challenge-joined` — after a participant joins (`explore/[id]` detail page).
  - `challenge-completed` — after a participant's status flips to `completed`.
  - `badge-received` — after accepting a NIP-58 badge from the Achievements tab on `/my-challenges`.
- **Locale-aware deep link** baked into the suggested content: the modal computes `${NEXT_PUBLIC_APP_URL}/${locale}/explore/${challenge_id}` (with a trailing-slash strip on the env var so a misconfigured base URL never produces a `//es/explore/…`).
- **Pre-filled, editable copy** — i18n strings under `shareOnNostr.suggested.*` give Spanish + English defaults per context (badge-received also interpolates the badge name); the user can rewrite the note in-modal before publishing.
- **Client-side signing** via the active signer (`useSignerContext().signWithPrompt`) — the same NIP-07 / NIP-46 / nsec signer the rest of the app uses. The note is built as a standard `buildNoteEvent` (kind:1) and published to `DEFAULT_RELAYS` via `publishSignedEvent`. No server round-trip; Arena never sees the note.
- **Idle / publishing / published / error** state machine in the modal — the user gets a clear "shared" confirmation, retries on failure, and the `onPublished` callback gives parent components a hook to dismiss / refresh.
- **Lazy-loaded** at every call site via `next/dynamic` so the modal's bundle only ships when a user actually opens a share flow.

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

- **Landing page** with a six-section narrative: Hero (dark, spotlight, pixel-art sword), How It Works (Crear → Batallá → Ganá), About (Habits vs Arena side-by-side), Partners (La Crypta + Nostr WoT), Support (zap-the-devs modal + GitHub star), Footer (motto, links, hackathon credit). PixelDissolve scattered-block transitions between sections.
- **Bottom-nav** with two tabs (Explore + My Challenges); Create and Settings reachable from buttons and the avatar menu.
- **`ceramic-card` mixin** as the single source for elevated surface styling — solid backgrounds, subtle borders, no glassmorphism. 26 modules consume it consistently.
- **Custom decorative system**: `Block`, `Bubble`, `BlockTower`, `PixelIcon` (sword / shield / trophy / flag / vs / lightning shapes), `PixelDissolve` — the visual language that carries the BitByBit "stacked blocks" identity.
- **Color palette**: purple primary (Nostr) + gold secondary (sats) + green success + red accent. Full light + dark theme tokens in `_colors.scss` / `_theme.scss`, theme switching via `next-themes` (Light / Dark / System), persisted in `localStorage`.
- **Typography**: Nunito + Nunito Sans from Google Fonts, consistent type scale (`$font-size-xs` → `$font-size-hero`, `$font-weight-normal` → `$font-weight-extrabold`).
- **Spacing & sizing scales**: `$spacing-4` through `$spacing-100`, `$border-radius-sm` through `$border-radius-full`. Hard rule: no hard-coded px values.
- **Custom SVG icon set** in `components/icons/` — no `lucide-react` or any icon library dependency.
- **UI primitives** in `components/ui/`: button, card, modal, dropdown, form (input + textarea + select + button), tabs, toast (with `useToast` hook), skeleton, block-loader, container, section, tag.
- **App shell pieces** in `components/layout/`: Navbar (theme + locale + auth-aware), Footer, NotificationBell (polls every 30s, click-through with locale-preserving navigation), AppPageHeader, AppBackgroundDecor, SignerProviderClient, SignerRequiredNotice, ReSignInModal (auto-prompts when nsec / NIP-46 needs to re-sign mid-flow).
- **Auth surface** in `components/auth/`: SignerMethodButtons picker, ExtensionSignerButton + ExtensionUpsell (NIP-07 fallback when `window.nostr` is missing), NostrConnectPanel (NIP-46 QR + bunker URL paste), NsecSignerForm (password input, reveal toggle, acknowledgement checkbox).
- **Onboarding** in `components/onboarding/`: OnboardingGate routes new users through a WelcomeModal with the explicit consent flow for paste-nsec ("I understand this key lives in browser memory…").
- **Challenge surface** in `components/challenges/`: ChallengeCard, ChallengeGrid, ExploreFilters (search + filter chips + sort dropdown + Only-following toggle), CreateChallengeForm (split into CheckpointEditor / RewardSection / VerificationSection), CheckpointItem (5 visual states: done / awaiting-review / rejected / locked / todo), CheckpointProgress (dot-per-step indicator), CheckpointSubmitForm, CheckpointSubmissionCard, CheckpointCompletionSection, AchievementCard, FundPotModal, ZapGoalProgress (live "Recent zappers" panel), ZapGoalBar (compact Explore-card variant), RewardDistributionPanel.
- **Common UX primitives** in `components/common/`: Avatar (Nostr-aware fallback), ImageUpload (Blossom round-trip with preview), TagInput (free-form pills with `MAX_TAGS` counter), OptionCard (radio-style selection), FieldLabel, FormDivider, Tooltip, Section, EmptyState, InfiniteScrollSentinel.
- **Share on Nostr modal** (`components/share/ShareOnNostrModal/`) for posting completions / awards back to relays from any flow.
- **Loading + empty states everywhere** — every list view ships skeleton loaders and friendly empty-state copy (audit pass aligned every microcopy string with i18n keys).
- **Mobile-first responsive**: bottom-nav on mobile / sidebar on desktop, safe-area-inset padding for notched devices, all decorative animations collapse on `@media (prefers-reduced-motion: reduce)`. SCSS breakpoints via `@include mobile / tablet / desktop` mixins.
- **Animations**: `fadeInUp`, `spotlight-pulse`, `block-drop`, `block-pulse`, `confetti-fall` (24 particles in 5 colors on zap success), `scroll-reveal` + `scroll-reveal-stagger` (driven by `useScrollReveal`), per-section `drift-a / drift-b / drift-c` for floating block decorators. All defined in SCSS modules — no runtime animation library.
- **Accessibility**: keyboard-accessible interactive elements, ARIA labels on icon-only controls (notification bell, theme toggle, etc.), focus management on modals, color contrast meeting WCAG 2.2 4.5:1 for text, color is never the sole indicator of meaning.

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
- **Seeder as a customizable template** (`scripts/seed.ts`) — 11 example challenges across the four verification methods, 8 mock users, plus a ready-to-payout `Demo: Tiered Prize Payout` with three pre-completed mocks at staggered `completed_at` timestamps so the tiered split is deterministic. Judges edit `MOCK_CHALLENGES` to suit their evaluation. Prize amounts kept tiny (21 sats `first_to_complete`, 100 sats `tiered`) so the Lightning flow is payable from any wallet during testing. Idempotent — wipes prior `mock-` rows before each insert.

### Testing

- **493 tests** across **51 test files** — split into a fast unit layer with mocked dependencies and an integration layer that runs against a real Neon test branch.
- **Unit suite** (33 files) — runs in ~2 seconds, no network dependencies. Covers handler / errors / parse / rate-limit / verification-methods (`tests/unit/api/`), JWT session + auth routes (`tests/unit/auth*.test.ts`, `tests/unit/verify.test.ts`), Lightning / NWC / LNURL / zap-goal-progress / await-zap-receipt (`tests/unit/lightning.test.ts`, `tests/unit/nostr/*.test.ts`, `tests/unit/zap-status.test.ts`), every Zod schema (`tests/unit/schemas/*` — challenges / completions / nostr / pagination / primitives / profile), per-route business logic (`award`, `challenges`, `challenge-detail`, `completions`, `join`), and shared helpers (`utils`, `validate-form`, `http-url-schema`).
- **Integration suite** (18 files) — runs sequentially against a shared Neon test database (CI gates on the `ci-shared-test-db` group to keep TRUNCATE between rebuilds from racing). Exercises the full request → Drizzle → Postgres flow, FK constraints, unique-index races, and progress recomputation: `award`, `badges-accept`, `challenges`, `challenges-follow`, `checkpoints`, `checkpoint-verify`, `completions-verify`, `join`, `my-badges`, `nostr-action-verify`, `nostr-hashtag-verify`, `notifications`, `notifications-emission`, `pending-checkpoint-submissions`, `popular-tags`, `profile`, `reward`, `zap-goal-progress`.
- **`@vitest-environment node`** declared at the top of every integration file so `@neondatabase/serverless` doesn't trip its "SQL from the browser" warning under the default jsdom global.
- **Run via** `npm test` (everything), `npm run test:unit` (~2s), `npm run test:integration` (~2 min, requires `.env.test` with a Neon test branch URL), or `npm run test:coverage` for a coverage report. Watch mode at `npm run test:watch`.

### NIPs implemented

NIP-01, NIP-02, NIP-07, NIP-19, NIP-25, NIP-46, NIP-57, NIP-58, NIP-75, NIP-92, NIP-98, plus Blossom BUD-01/02.

Custom event kinds: `30100` (challenge definition), `7100` (challenge join), `7101` (completion submission), `30101` (challenge result), `kind:24242` (Blossom upload auth). Kind 30100 overlaps with the unmerged [NIP-113](https://github.com/nostr-protocol/nips/pull/1508) (Activity Events) proposal and will be revisited if that NIP is accepted.

### Documentation

- **17 documentation files** in `docs/`, the source of truth for architecture decisions, Nostr event design, and individual flows:
  - [`testing-plan.md`](docs/testing-plan.md) — eleven-step judge walkthrough, every Nostr event kind labelled.
  - [`api.md`](docs/api.md) + [`openapi.yaml`](docs/openapi.yaml) — OpenAPI 3.1 reference for every route under `app/api/` (36 operations across 25 paths, redocly-clean).
  - [`architecture.md`](docs/architecture.md) — stack, project structure, design decisions, data flow.
  - [`nostr-events.md`](docs/nostr-events.md) — every custom event kind (30100 / 7100 / 7101 / 30101 / 30009 / 30008 / 8 / 9041 / 9734 / 9735) with full tag schemas and conditional emission rules.
  - [`nostr-flows.md`](docs/nostr-flows.md) — end-to-end sequences for nostr-action proof, checkpoints, and zap rewards.
  - [`nostr-login.md`](docs/nostr-login.md) — NIP-98 auth flow + all three signer methods.
  - [`proof-of-completion.md`](docs/proof-of-completion.md) — the four verification paths.
  - [`prize-distribution.md`](docs/prize-distribution.md) — funding via NIP-75, payout via NIP-57.
  - [`checkpoints.md`](docs/checkpoints.md) — multi-step challenges, state machine, sequential / parallel modes.
  - [`feed-and-explore.md`](docs/feed-and-explore.md) — search, filters, sorts, follow boost.
  - [`tags.md`](docs/tags.md) — tagging system and Nostr `t`-tag interoperability.
  - [`product-vision.md`](docs/product-vision.md), [`landing-design.md`](docs/landing-design.md), [`about-page.md`](docs/about-page.md), [`settings-page.md`](docs/settings-page.md) — UX surfaces.
  - [`deploy.md`](docs/deploy.md) — Vercel + Neon production setup.
  - [`testing.md`](docs/testing.md) — unit vs integration test strategy.
- **CLAUDE.md** + **SUBMISSION.md** at repo root — coding conventions for AI assistants and judge quickstart, respectively.
- A full audit pass at release time aligned every doc with shipped behaviour — every claim cross-referenced against code.

### Credits

- **Anix** ([@analiaacostaok](https://github.com/analiaacostaok)) — solo developer. Architecture, implementation, design, and the v1.0.0 hackathon submission.

Built at La Crypta, the Bitcoin community in Argentina that hosted both hackathons.

Sibling project: [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) (Hackathon 1 FOUNDATIONS — Lightning).

[1.0.1]: https://github.com/bitbybit-ar/bitbybit-arena/releases/tag/v1.0.1 
[1.0.0]: https://github.com/bitbybit-ar/bitbybit-arena/releases/tag/v1.0.0
