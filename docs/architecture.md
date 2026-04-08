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
- **User preferences** — Notification settings, favorite challenges, display options

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

1. User clicks "Login with Nostr"
2. App calls `window.nostr.getPublicKey()` (NIP-07)
3. Server creates session linked to Nostr pubkey
4. User profile fetched from relays (NIP-01 kind:0 metadata)
5. Session stored as httpOnly cookie (same as habits)

No email/password. Nostr identity is the only auth method — keeps it simple and aligned with the hackathon theme.

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

### Text-only proofs for MVP
Proofs are text descriptions submitted as Nostr events. Photo/video uploads (Blossom/NIP-B7) deferred to post-MVP to keep complexity low and the demo flow fast.
