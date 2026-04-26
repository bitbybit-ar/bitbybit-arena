# Architecture

## Stack

Mirrors [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) for consistency and code quality:

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js (latest), React 19, TypeScript strict |
| **Styles** | SCSS modules (no Tailwind, no CSS-in-JS) |
| **Icons** | Custom SVGs in `components/icons/` |
| **i18n** | next-intl with `[locale]` routing (es default, en second) |
| **Auth** | Nostr only — three signers (NIP-07 extension, NIP-46 bunker, paste-nsec local) all converging on a NIP-98 HTTP Auth event. See [docs/nostr-login.md](./nostr-login.md). |
| **Protocol** | Nostr via nostr-tools |
| **Zaps** | NIP-57 (client-side only, no server-side Lightning/invoices) |
| **Proofs** | Text + image (Blossom BUD-01/02) with NIP-92 `imeta` tags |
| **Badges** | NIP-58 (kind 30009 definition, kind 8 award, kind 30008 profile-badges with merge-preserve) |
| **Database** | Neon DB (PostgreSQL) via @neondatabase/serverless + Drizzle ORM |
| **API Docs** | OpenAPI 3.1 — [`docs/openapi.yaml`](./openapi.yaml), reader's guide at [`docs/api.md`](./api.md) |
| **Font** | Nunito / Nunito Sans |

## Why a Database if It's Nostr-Native?

Nostr relays are not databases. We need server-side storage for:

- **Challenge metadata indexing** — Fast queries for open challenges, filters, search
- **Participation tracking** — Who joined what, completion progress, streak counts
- **Verification queue** — Pending completions awaiting creator/community approval
- **Caching** — Relay responses cached for performance
- **User preferences** — Per-type notification opt-outs (stored as a jsonb `notification_prefs` map on `users`), favorite challenges, display options

The Nostr events are the **source of truth** for public data. The database is an **index and cache** that enables fast queries the app needs.

## Project Structure

```
bitbybit-arena/
  app/
    [locale]/                  <- i18n routes (es, en)
      (auth)/signin/           <- Three-tab signer picker (extension/bunker/nsec)
      (app)/
        explore/               <- Browse + filter + sort, plus [id] detail
        my-challenges/         <- Joined / Created / Achievements tabs
        create/                <- Challenge creation form
        settings/              <- Profile + preferences + notifications + danger zone
      about/                   <- Public about page
      layout.tsx
      page.tsx                 <- Landing page
    api/                       <- Routes (outside [locale])
      auth/                    <- nostr (NIP-98 login), session, signout
      challenges/              <- list/create + per-id CRUD, join, completions,
                                  checkpoints, award, reward, zap-goal-progress,
                                  pending-checkpoint-submissions, participants
      completions/[id]/verify  <- Creator approve/reject for non-checkpoint flow
      checkpoint-completions/[id]/verify
      badges/[id]              <- Accept-on-Nostr stamp
      profile/                 <- GET/PUT/DELETE + sync subroute
      my-badges/, my-challenges/
      notifications/, tags/popular/, zap/status/
    layout.tsx
  components/
    common/                    <- Block, BlockTower, Bubble, PixelIcon,
                                  PixelDissolve, Avatar, ImageUpload, etc.
    icons/                     <- Custom SVG icons as React components
    layout/                    <- Navbar, Footer, ReSignInModal,
                                  SignerProviderClient, NotificationBell
    landing/                   <- Hero, HowItWorks, About, Partners, Support, ZapModal
    auth/                      <- ExtensionSignerButton, NostrConnectPanel,
                                  NsecSignerForm, SignerMethodButtons
    challenges/                <- ChallengeCard, CreateChallengeForm,
                                  CheckpointItem, FundPotModal, ZapGoalProgress,
                                  RewardDistributionPanel, etc.
    about/                     <- Story, Projects, Team, LaCrypta, OpenSource
    onboarding/                <- OnboardingGate, WelcomeModal
    share/ShareOnNostrModal/
    ui/                        <- button, card, modal, dropdown, form, tabs,
                                  toast, skeleton, block-loader, etc.
  i18n/
    request.ts
    routing.ts
  lib/
    api/                       <- apiHandler wrapper, errors, rate-limit,
                                  verification-methods helper
    db/                        <- schema, connection, checkpoints helper
    nostr/                     <- events, verify, signers, fetch-events,
                                  verify-like, verify-hashtag-post, lnurl,
                                  blossom, nip46-login, relays, metadata
    hooks/                     <- useScrollReveal, useFollowList,
                                  useZapGoalProgress, etc.
    schemas/                   <- Zod request/response schemas
    contexts/theme-context.tsx <- Theme provider (light/dark/system)
    auth.ts, auth-constants.ts <- JWT session helpers + cookie name constant
    signer-context.tsx         <- Active signer + completeLoginWithSigner
    types.ts                   <- Shared TypeScript interfaces
    lightning.ts, seo.ts, env.ts, notifications.ts, utils.ts
  messages/                    <- es.json, en.json
  styles/                      <- SCSS foundation
    _colors.scss, _theme.scss, _spacing.scss, _typography.scss,
    _common-mixins.scss (incl. ceramic-card), _media-mixins.scss,
    globals.scss
  tests/
    unit/, integration/        <- See docs/testing.md
  docs/                        <- Design docs, Nostr event specs, openapi.yaml
  drizzle/                     <- Migrations
  scripts/                     <- migrate.ts, seed.ts
```

## Key Differences from bitbybit-habits

| Aspect | Habits | Arena |
|--------|--------|------------|
| **Auth** | Email/password + optional Nostr | Nostr only — NIP-07 / NIP-46 / paste-nsec, all over NIP-98 |
| **Data model** | Private, family-scoped | Public, network-wide |
| **Payments** | Sponsor pays kid (NWC) | Zaps only (NIP-57, client-side) |
| **Users** | Sponsor + Kid roles | Single role (Nostr identity) |
| **Navigation** | Role-based dashboards | 2 tabs (Explore, My Challenges) |
| **Content** | Private habits and completions | Public events on Nostr relays |

## Auth Flow

1. User picks a signer on `/signin`: NIP-07 extension, NIP-46 bunker, or paste-nsec local signer.
2. Client builds an unsigned NIP-98 HTTP Auth event (kind 27235) bound to `POST /api/auth/nostr` via `u` and `method` tags, with `signer_type` embedded as a custom `["arena_signer", ...]` tag.
3. Signer signs; client POSTs with `Authorization: Nostr <base64(event)>`.
4. Server validates signature (Schnorr via `nostr-tools/pure.verifyEvent`), URL/method binding, and ±30 s `created_at` window. User record is upserted by pubkey; kind:0 profile is fetched from relays (NIP-01).
5. Session is a JWT in `__Host-session` (prod) / `session` (dev) httpOnly cookie, 7-day expiry.

No email, no password, no challenge round-trip. Nostr identity is the only auth method — keeps it simple and aligned with the hackathon theme.

## Data Flow

```
User Action
    |
    v
Next.js Client (React)
    |
    +--> API Route (validation, auth check)
    |       |
    |       +--> Database (index, cache, state)
    |       |
    |       +--> Nostr Relay Pool (publish event)
    |
    +--> Direct Nostr subscription (feed, real-time updates)
```

## Design Decisions

### Mobile-first, bottom tab navigation
The two bottom-nav tabs are Explore + My Challenges — those are the surfaces a user lives in. The other authenticated surfaces (`/create`, `/settings`) are reached from in-page buttons and the avatar menu, not from the bottom nav, so the tab strip stays at two items. On desktop, the nav becomes a sidebar / top nav. Fewer permanent tabs = less cognitive load, better UX score from AI judges.

### Nostr-first, database-second
Events are always published to Nostr relays first. The database indexes them for fast queries. If the database is empty, the app can rebuild state from relay events.

### Proofs: text + image, via Blossom
Proofs are text descriptions, image uploads, or both, submitted as Nostr events. Images are uploaded to a Blossom server (BUD-01/02) — the client hashes the file, signs a short-lived kind:24242 auth event, and PUTs the bytes; the returned URL is mirrored into the kind:7101 completion event alongside a NIP-92 `imeta` tag carrying the sha256, size, and mime type so recipients can verify the blob from the event alone.
