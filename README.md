# BitByBit Challenges

**Nostr-native challenge client** where users create, join, and compete in challenges — earning badges and sats via Lightning Network.

Part of the [BitByBit](https://github.com/bitbybit-ar) ecosystem.

## Concept

Any Nostr user can create a challenge (e.g., "30-day cold shower", "Read 5 books this month", "Best photo of your city"). Other users join, submit proof of completion (photos, activity data), and earn rewards:

- **Badges** (NIP-58) — Awarded automatically on completion
- **Sat prizes** (Lightning) — Funded by the challenge creator, distributed by rules (first to complete, most points, etc.)
- **Zaps** (NIP-57) — Community can zap completions they find impressive

Activity is published to Nostr, so challenge creation, completions, and wins appear in the broader network — not locked inside the app.

## Core Flow

```
Creator publishes challenge -> visible on Nostr + in-app feed
Users join challenge -> tracked as participants
Users submit proof (photo, text, data) -> uploaded via Blossom/NIP-96
Verification: creator approval, community vote, or automatic
On completion -> badge awarded (NIP-58) + prize distributed (Lightning)
Events posted to Nostr -> followers see activity in any client
```

## App Structure (3 tabs)

1. **Feed** — Global activity (public) or followed users' activity (logged in)
2. **Explore** — Browse open challenges + create new ones
3. **My Challenges** — Challenges the user has joined, progress, and history

## Key Differentiator

**Nothing like this exists on Nostr.** The primitives are there (zaps, badges, media uploads, lists) but nobody has built a challenge-sharing client that ties them together.

## Stack

- **Framework**: Next.js, React 19, TypeScript strict
- **Styles**: SCSS modules
- **Auth**: Nostr (NIP-07 browser extension login)
- **Protocol**: Nostr events (custom kinds for challenges + standard NIPs)
- **Payments**: Lightning Network (NWC + WebLN + Zaps)
- **Media**: Blossom (NIP-B7) / NIP-96 for proof uploads
- **Badges**: NIP-58

## Hackathon

- **Event**: Hackathon #2 de La Crypta (Nostr theme)
- **Team**: BitByBit (bitbybit-ar)
- **Related project**: [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) — Habit tracker with Lightning rewards (Hackathon #1, FOUNDATIONS)

## Documentation

- [Product Vision](docs/product-vision.md) — Detailed concept, user stories, and UX decisions
- [Landing Page Design](docs/landing-design.md) — Sections, animations, color palette, component breakdown
- [Feed & Explore](docs/feed-and-explore.md) — Public pages, search, filters, sort, personalized content
- [Tags](docs/tags.md) — Challenge tagging system, seed list, filtering, Nostr interoperability
- [About Page](docs/about-page.md) — Project story, team members, La Crypta, open source
- [Nostr Login](docs/nostr-login.md) — 3 login methods: extension, QR/NIP-46, paste nsec
- [Settings Page](docs/settings-page.md) — Profile, wallet (NWC/WebLN), preferences
- [Nostr Event Design](docs/nostr-events.md) — Custom event kinds, data model, and NIP usage
- [Architecture](docs/architecture.md) — Technical stack, project structure, and design decisions
- [Proof of Completion](docs/proof-of-completion.md) — How users prove they completed a challenge
- [Prize Distribution](docs/prize-distribution.md) — Lightning payment flows and prize rules
