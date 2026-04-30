# Contributing to BitByBit Arena

Thanks for your interest in contributing! Arena is a Nostr-native challenge platform — anyone can create challenges, compete, and earn NIP-58 badges that live on their Nostr identity.

The README is bilingual-friendly; this guide is in English so it's easy to share with contributors outside the Spanish-speaking team.

## Who can push to this repo

- **Direct push access** is restricted to members of the [`bitbybit-ar`](https://github.com/bitbybit-ar) GitHub organization, and even maintainers don't push to `main` — every change goes through a PR.
- **External contributors** work via the standard fork-and-PR flow:
  1. Fork `bitbybit-ar/bitbybit-arena` on GitHub.
  2. Push your branch to your fork.
  3. Open a PR against `main` of the upstream repo.
  4. A maintainer reviews and merges.

There is no CLA. By opening a PR you agree your contribution is under the repo's existing license.

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- A Neon DB (PostgreSQL) connection string for local dev — free tier works
- A Nostr identity for end-to-end testing (browser extension, NIP-46 bunker, or an nsec)

### Setup

```bash
git clone https://github.com/<your-fork>/bitbybit-arena.git
cd bitbybit-arena
npm install
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET, etc.
npm run dev
```

Open `http://localhost:3000`. Spanish is the default locale; English is at `/en`.

### Database

Schema lives in `lib/db/schema.ts` (Drizzle source of truth). Migrations are in `drizzle/`. To apply migrations against your local DB:

```bash
npm run db:migrate    # if defined in package.json — otherwise see docs/architecture.md
```

If you change the schema, generate a new migration rather than editing existing ones.

### Common commands

```bash
npm run dev            # Dev server
npm run build          # Production build
npm run lint           # ESLint
npm test               # Vitest
npm run test:watch
npm run test:coverage
npx tsc --noEmit       # Type check only
```

## Project layout

See [CLAUDE.md](CLAUDE.md) for the full structure. The short version:

- `app/[locale]/` — i18n-aware pages (Explore, My Challenges, Create, Settings, About)
- `app/api/` — API routes (auth, challenges, completions, badges, profile, etc.)
- `components/` — UI organized by domain (`common`, `challenges`, `auth`, `landing`, ...)
- `lib/nostr/` — NIP-07 / NIP-46 signers, NIP-98 verification, event builders, Blossom uploads
- `lib/db/` — Drizzle schema and helpers
- `messages/{es,en}.json` — i18n strings (Spanish is the default)
- `styles/` — SCSS foundation (`_colors`, `_theme`, `_spacing`, `_typography`, mixins)
- `docs/` — design docs and Nostr event specs

## Types of contributions

### Bug fixes

1. Search existing issues first.
2. Open an issue describing the bug and how to reproduce it (or jump straight to a PR for small fixes).
3. Add a test that reproduces the bug when it makes sense.
4. Fix it. Make sure `npm run lint`, `npx tsc --noEmit`, and `npm test` all pass.

### New features

1. Open an issue first so we can align on scope before code is written.
2. If the feature touches Nostr, link the relevant NIP and check `docs/nostr-events.md` and `docs/nostr-flows.md`.
3. Follow existing patterns — verification methods, API handlers, SCSS modules, i18n keys.
4. Add tests for new server logic (`tests/integration/**` for DB-touching tests, unit tests elsewhere).

### Adding a new verification method

Verification methods (text, photo, NIP-25 like, hashtag post, ...) plug into a single helper. Look at:

- `lib/api/verification-methods` — the registry
- `lib/nostr/verify-like.ts` and `lib/nostr/verify-hashtag-post.ts` — reference implementations
- `docs/proof-of-completion.md` — design doc

### Translations

`messages/es.json` and `messages/en.json` must stay in sync. If you add a key in one, add it in the other. Spanish is the source of truth for tone.

### Documentation

Docs live in `docs/`. README and CLAUDE.md describe the high-level project; per-feature docs are alongside the design notes. Doc-only PRs are very welcome.

## Pull request process

### 1. Branch

Branch off `main` with a descriptive name:

- `feat/<description>` — new functionality
- `fix/<description>` — bug fixes
- `docs/<description>` — documentation only
- `chore/<description>` — tooling, deps, CI

### 2. Code style

- TypeScript strict mode; no `any` (use `unknown` + type guards).
- SCSS modules only — no Tailwind, no CSS-in-JS. Use the variables in `styles/_colors.scss`, `_spacing.scss`, `_typography.scss`. Don't hardcode colors or px values.
- Use the `ceramic-card` mixin for elevated surfaces.
- Icons are SVG React components in `components/icons/`. Don't add icon libraries.
- Server Components by default; `"use client"` only when you need hooks, events, or browser APIs.
- All visible strings go through `next-intl` (`useTranslations` / `getTranslations`) and into both `es.json` and `en.json`.

### 3. Commits

- Plain English commit messages, present tense, focused on the why.
- Keep commits scoped — easier to review and revert.
- Don't force-push to a branch that already has review comments. Merge `main` into your feature branch instead of rebasing once it's on origin.

### 4. Open the PR

- Clear title (e.g., `feat: add hashtag-post verification` or `fix: badge accept timestamp off by one`).
- Describe what changed and why. Link the issue if there is one.
- Include screenshots / recordings for UI changes.
- Note any new env vars, migrations, or relay assumptions.
- Confirm `npm run lint`, `npx tsc --noEmit`, and `npm test` pass locally.

A maintainer will review. Expect feedback — Arena's design system and Nostr conventions are intentional, and we'd rather iterate than land something off-pattern.

## Security

If you find a security issue, **do not open a public issue**. Email the maintainers (see `package.json` or the org page) with details and a reproduction. We'll coordinate a fix and disclosure.

General guidelines when contributing:

- Never log private keys, nsec, or session tokens.
- All POSTs to authenticated endpoints must go through NIP-98 HTTP Auth (`lib/nostr/verify.ts`).
- Validate all request bodies with the Zod schemas in `lib/schemas/`.
- Don't interpolate user input into SQL — use Drizzle's parameterized queries.

## Code of conduct

Be respectful, constructive, and focused on building good software. Technical disagreement is welcome; personal attacks are not.
