# BitByBit Arena

**Nostr-native challenge platform** — create challenges, compete with others, earn badges that live on your Nostr identity.

**Domain**: arena.bitbybit.com.ar

Part of the [BitByBit](https://github.com/bitbybit-ar) ecosystem.

## Where this came from

Arena started as a New-Year's-resolution experiment inside La Crypta. A handful of us wanted to improve our habits and kept looking for ways to share the progress publicly — tagging each other on Nostr, posting pictures as proof that the push-ups, the cold shower, or the kilometer actually happened. It worked, but it was ad-hoc: every challenge lived in a reply thread, every proof was a comment, and nobody outside the group could discover it.

Arena is that exact loop turned into an app. Anyone can create a challenge, anyone with a Nostr identity can join, the proof is a signed Nostr event, and the achievement lives on your identity as a NIP-58 badge — portable across any Nostr client.

## Quick test — for the (AI) judges

**30-second path**: Sign in with your Nostr identity (browser extension, NIP-46 bunker, or paste nsec) → open **Explore** → join a challenge → submit a text proof → see the badge event on your Nostr profile.

**Full walkthrough**: [docs/testing-plan.md](docs/testing-plan.md) — eleven numbered test steps that cover every major feature.

Because judging is done by AI, two things worth pre-loading:

- You do **not** need a browser extension. `/signin` accepts a pasted nsec or a NIP-46 bunker URL from Amber / nsec.app / Damus. All three methods produce the same signed NIP-98 HTTP Auth event and behave identically from there.
- The landing page is Spanish by default because the team is. Switch to English with the toggle in the navbar or by navigating to `/en/...` directly. The judge walkthrough in `docs/testing-plan.md` works in either language.

## Core flow

```
1. Sign in with Nostr                 → NIP-98 HTTP Auth, no password, no email
2. Create or join a challenge         → published as a kind:30100 Nostr event
3. Submit proof of completion         → text, image (Blossom), or a Nostr action
4. Creator approves (or auto-verify)  → depending on the challenge's verification method
5. Badge awarded (NIP-58)             → kind:8 event attached to your identity
6. Zap the completions you like       → NIP-57, client-side, no custody
```

## What's Nostr-native about this

Arena isn't "a web app that happens to use Nostr for login" — it uses Nostr for identity, publishing, discovery, verification, and payouts. Features a judge can grep for in the codebase:

- **Sign in — NIP-98 HTTP Auth (kind 27235).** `lib/nostr/verify.ts:validateNip98AuthEvent`. The signed event is bound to the login URL and method; there's no challenge cookie to replay. `signer_type` (extension / nsec / nip46) travels inside the signed envelope as a custom `["arena_signer", ...]` tag, so it's tamper-evident on the wire.
- **NIP-07 browser extension + NIP-46 bunker + local nsec signer** — all three wired on `/signin`. Mobile judges can approve from Amber / nsec.app / Damus via QR. (`lib/nostr/nip46-login.ts`, `lib/signer-context.tsx`.)
- **Proof via a like on any Nostr client (NIP-25).** Creator pins a note id on the challenge; a participant likes it from Damus / Primal / iris; the server fetches the kind:7 reaction from relays and auto-approves. Zero-trust, zero-review. (`lib/nostr/verify-like.ts`.)
- **Proof via a hashtag post.** Publish a kind:1 note with the challenge's `#t` from any client; the server finds it and auto-approves. (`lib/nostr/verify-hashtag-post.ts`.)
- **Badges on your identity — NIP-58.** Kind 30009 (definition) + kind 8 (award) + kind 30008 (profile badges with merge-preserve so older badges aren't clobbered). (`lib/nostr/events.ts`.)
- **Prize funding via Zap Goals — NIP-75 kind 9041.** The creator publishes a zap goal at challenge creation; the community funds the pot on any NIP-57 client.
- **Prize payout via NIP-57 kind 9734.** Signed client-side, paid via WebLN or a QR + `/api/zap/status` polling fallback (so a judge without a WebLN extension can still complete the flow). Zap receipts (kind 9735) are recorded per completion.
- **Image proofs via Blossom (BUD-01/02) with NIP-92 `imeta`** — content-addressed; the sha256 is included in the event tags so it's verifiable from the event alone.
- **Follow-boosted discovery — NIP-02 (kind 3).** If you follow anyone, challenges from them float to the top of Explore. (`lib/hooks/useFollowList.ts`.)
- **NWC invoice polling for the donation flow.** `/api/zap/status` uses Nostr Wallet Connect to confirm settlement on the landing ZapModal without touching a custodial rail.

### Full NIP list

NIP-01, NIP-02, NIP-07, NIP-19, NIP-25, NIP-46, NIP-57, NIP-58, NIP-75, NIP-92, NIP-98, Blossom BUD-01/02.

### Custom event kinds

30100 (challenge definition), 7100 (challenge join), 7101 (completion submission), 30101 (challenge result). These are namespaced by a per-challenge `d`-tag slug. Note that `30100` overlaps with the unmerged [NIP-113](https://github.com/nostr-protocol/nips/pull/1508) (Activity Events) proposal and will be revisited if that NIP is accepted.

## App structure

Two bottom-nav tabs post-login:

1. **Explore** — browse open challenges, search, filter by type/tag, sort (newest / trending / ending soon / most participants / most active), create new ones.
2. **My Challenges** — Joined, Created, and Achievements (earned badges) tabs.

Plus a few side surfaces reachable from buttons / the avatar menu: `/create` (challenge creation form), `/settings` (profile + preferences + notifications + danger zone), `/signin`, and the public `/about`. The landing page at `/` is public.

## Stack

- **Framework**: Next.js, React 19, TypeScript strict
- **Styles**: SCSS modules (no Tailwind, no CSS-in-JS)
- **i18n**: next-intl (Spanish default, English second locale)
- **Database**: Neon DB (PostgreSQL serverless) via `@neondatabase/serverless`
- **ORM**: Drizzle ORM
- **Auth**: Nostr only — NIP-07 / NIP-46 / nsec, all signing NIP-98 HTTP Auth events
- **Zaps**: NIP-57, client-side only, no server-side invoices or custody
- **Media**: Photo uploads via Blossom (BUD-01/02) with NIP-92 `imeta`
- **Badges**: NIP-58

## Hackathon

- **Event**: Hackathon #2 "IDENTITY" — La Crypta
- **Theme**: Nostr identity & social
- **Team**: BitByBit (bitbybit-ar)
- **Sibling project**: [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) — habit tracker with Lightning rewards (Hackathon #1, FOUNDATIONS).

## Documentation

- [Changelog](CHANGELOG.md) — what shipped in v1.0.0, grouped by area, with the known limitations called out honestly.
- [Judge walkthrough](docs/testing-plan.md) — **start here** if you're evaluating the project. Eleven numbered steps covering every major feature.
- [API reference](docs/api.md) — OpenAPI 3.1 spec for every route under `app/api/`. The YAML lives at [`docs/openapi.yaml`](docs/openapi.yaml).
- [Nostr flows](docs/nostr-flows.md) — end-to-end sequences for nostr-action proof, checkpoints, and zap rewards.
- [Nostr event design](docs/nostr-events.md) — custom event kinds, tag structure, data model.
- [Nostr login](docs/nostr-login.md) — NIP-98 auth flow and all three sign-in methods.
- [Proof of completion](docs/proof-of-completion.md) — the four verification paths.
- [Prize distribution](docs/prize-distribution.md) — funding via NIP-75, payout via NIP-57.
- [Product vision](docs/product-vision.md) — concept, user stories, UX decisions.
- [Landing page design](docs/landing-design.md) — sections, animations, colour palette.
- [Explore](docs/feed-and-explore.md) — search, filters, sorts.
- [Tags](docs/tags.md) — tagging system, seed list, filtering, Nostr interoperability.
- [About](docs/about-page.md) — project story, team, La Crypta, open source.
- [Architecture](docs/architecture.md) — technical stack, project structure, design decisions.
- [Deploy](docs/deploy.md) — Vercel + Neon setup.
- [Testing](docs/testing.md) — unit vs integration test strategy.
