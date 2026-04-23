# Architecture

## Stack

Mirrors [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) for consistency and code quality:

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js (latest), React 19, TypeScript strict |
| **Styles** | SCSS modules (no Tailwind, no CSS-in-JS) |
| **Icons** | Custom SVGs in `components/icons/` |
| **i18n** | next-intl with `[locale]` routing (es default, en second) |
| **Auth** | Nostr (NIP-07 browser extension) — primary and only auth method |
| **Protocol** | Nostr via nostr-tools |
| **Zaps** | NIP-57 (client-side only, no server-side Lightning/invoices) |
| **Proofs** | Text-only for MVP (photo upload deferred) |
| **Badges** | NIP-58 badge creation and awarding |
| **Database** | Neon DB (PostgreSQL) via @neondatabase/serverless + Drizzle ORM |
| **API Docs** | OpenAPI 3.0 (Swagger) |
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
      (auth)/                  <- Nostr login
      (app)/                   <- Main app (2 tabs)
        explore/               <- Browse + create challenges
        my-challenges/         <- User's joined challenges
      layout.tsx
      page.tsx                 <- Landing page
    api/                       <- API routes (outside [locale])
      auth/                    <- Nostr auth endpoints
      challenges/              <- CRUD, join, search, filter
      completions/             <- Submit, verify, list
      badges/                  <- Create, award, list
      nostr/                   <- Relay management, event publishing
    layout.tsx
  components/
    icons/                     <- Custom SVG icons
    layout/                    <- Navbar (bottom tabs on mobile), Header
    ui/                        <- Button, Card, Modal, Avatar, Badge, etc.
    challenges/                <- ChallengeCard, ChallengeForm, ProofSubmit
    profile/                   <- UserProfile, BadgeDisplay
  i18n/
    request.ts
    routing.ts
  lib/
    api/                       <- apiHandler wrapper, errors, validation
    db/                        <- Drizzle schema, connection
    nostr/                     <- Event builders, relay pool, subscriptions
    hooks/                     <- useNostr, useChallenge
    auth.ts                    <- Nostr session management
    types.ts                   <- Shared TypeScript interfaces
  messages/                    <- es.json, en.json
  styles/                      <- SCSS variables, mixins, glass system
  tests/
    api/
    helpers/
  docs/
    openapi.yaml
  middleware.ts
```

## Key Differences from bitbybit-habits

| Aspect | Habits | Arena |
|--------|--------|------------|
| **Auth** | Email/password + optional Nostr | Nostr only (NIP-07) |
| **Data model** | Private, family-scoped | Public, network-wide |
| **Payments** | Sponsor pays kid (NWC) | Zaps only (NIP-57, client-side) |
| **Users** | Sponsor + Kid roles | Single role (Nostr identity) |
| **Navigation** | Role-based dashboards | 2 tabs (Explore, My Challenges) |
| **Content** | Private habits and completions | Public events on Nostr relays |

## Auth Flow

1. User picks a signer on `/signin`: NIP-07 extension, NIP-46 bunker, or paste-nsec local signer.
2. Client builds an unsigned NIP-98 HTTP Auth event (kind 27235) bound to `POST /api/auth/nostr` via `u` and `method` tags, with `signer_type` embedded as a custom `["arena_signer", ...]` tag.
3. Signer signs; client POSTs with `Authorization: Nostr <base64(event)>`.
4. Server validates signature (Schnorr via `nostr-tools/pure.verifyEvent`), URL/method binding, and ±60 s `created_at` window. User record is upserted by pubkey; kind:0 profile is fetched from relays (NIP-01).
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
The 2-tab layout (Explore + My Challenges) uses a bottom navigation bar on mobile (standard mobile pattern). On desktop, it becomes a sidebar or top nav. Fewer tabs = less cognitive load, better UX score from AI judges.

### Nostr-first, database-second
Events are always published to Nostr relays first. The database indexes them for fast queries. If the database is empty, the app can rebuild state from relay events.

### Proofs: text + image, via Blossom
Proofs are text descriptions, image uploads, or both, submitted as Nostr events. Images are uploaded to a Blossom server (BUD-01/02) — the client hashes the file, signs a short-lived kind:24242 auth event, and PUTs the bytes; the returned URL is mirrored into the kind:7101 completion event alongside a NIP-92 `imeta` tag carrying the sha256, size, and mime type so recipients can verify the blob from the event alone.
