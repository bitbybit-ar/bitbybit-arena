# BitByBit Arena

**Nostr-native challenge platform** — create challenges, compete with others, earn badges that live on your Nostr identity.

**Domain**: arena.bitbybit.com.ar

Part of the [BitByBit](https://github.com/bitbybit-ar) ecosystem.

## What is it?

Any Nostr user can create a challenge (e.g., "30-day cold shower", "Read 5 books this month", "Best photo of your city"). Others join, submit proof of completion, and the community votes to verify. Completers earn **NIP-58 badges** tied to their Nostr identity — portable across any Nostr client.

Zaps (NIP-57) let the community tip impressive completions and fund challenge prizes.

## Quick Test (for judges)

You can test the full flow in seconds:

1. **Login** — Click "Login with Nostr" (requires a NIP-07 browser extension like Alby or nos2x)
2. **Explore** — Browse open challenges, join one, or create your own
3. **Complete** — Submit proof of completion, community votes, earn a badge on your Nostr profile

That's it. Login → Join → Complete → Badge on your identity.

## Core Flow

```
1. Login with Nostr (NIP-07)        → profile auto-created from relay metadata
2. Create or join a challenge       → published as Nostr events
3. Submit text proof of completion  → community votes to verify
4. Badge awarded (NIP-58)           → attached to your Nostr identity
5. Zap completions you like (NIP-57)→ optional, community-driven
```

## Nostr-native flows (new)

On top of the base flow, a challenge can opt into any combination of three Nostr-native features:

- **Nostr-action proof** — the creator pins a target note id and participants prove completion by **liking that note on any Nostr client**. The server verifies the kind 7 reaction on relays and auto-approves the completion. No text review, no trust.
- **Checkpoints** — split a challenge into sequential or parallel sub-tasks. Each checkpoint has its own verification type (including nostr_action). Sequential mode gates later checkpoints until earlier ones are approved.
- **Zap rewards** — creators can publish a NIP-75 Zap Goal at creation so the community can fund the pot, and pay winners directly from their own Lightning wallet via a client-side NIP-57 + WebLN loop. No server-side custody, no invoices on our servers.

See [docs/nostr-flows.md](docs/nostr-flows.md) for the full end-to-end sequence, data model, and file references.

## App Structure (2 tabs)

1. **Explore** — Browse open challenges, search, filter + create new ones
2. **My Challenges** — Challenges joined, progress, completions, and badges earned

## Key Differentiator

**Nothing like this exists on Nostr.** The primitives are there (zaps, badges, events) but nobody has built a challenge platform that ties them together into a social competition layer where your achievements become part of your Nostr identity.

## Stack

- **Framework**: Next.js, React 19, TypeScript strict
- **Styles**: SCSS modules
- **i18n**: next-intl (Spanish default, English)
- **Auth**: Nostr (NIP-07 browser extension)
- **Database**: Neon DB (PostgreSQL) + Drizzle ORM
- **Protocol**: Nostr events (NIP-01, NIP-57, NIP-58, NIP-75)
- **Zaps**: NIP-57 (client-side, no server-side invoices)
- **Badges**: NIP-58 (tied to Nostr identity)

## Hackathon

- **Event**: Hackathon #2 "IDENTITY" de La Crypta
- **Theme**: Nostr Identity & Social
- **Team**: BitByBit (bitbybit-ar)
- **Related project**: [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) — Habit tracker with Lightning rewards (Hackathon #1, FOUNDATIONS)

## Documentation

- [Product Vision](docs/product-vision.md) — Detailed concept, user stories, and UX decisions
- [Landing Page Design](docs/landing-design.md) — Sections, animations, color palette, component breakdown
- [Explore](docs/feed-and-explore.md) — Public pages, search, filters, sort
- [Tags](docs/tags.md) — Challenge tagging system, seed list, filtering, Nostr interoperability
- [About Page](docs/about-page.md) — Project story, team members, La Crypta, open source
- [Nostr Login](docs/nostr-login.md) — Login with NIP-07 browser extension
- [Nostr Event Design](docs/nostr-events.md) — Custom event kinds, data model, and NIP usage
- [Architecture](docs/architecture.md) — Technical stack, project structure, and design decisions
- [Proof of Completion](docs/proof-of-completion.md) — How users prove they completed a challenge
- [Prize Distribution](docs/prize-distribution.md) — Funding pots via NIP-75 and paying winners via NIP-57
- [Nostr Flows](docs/nostr-flows.md) — Nostr-action proof, checkpoints, and zap rewards end-to-end
