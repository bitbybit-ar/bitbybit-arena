# Testing Guide — BitByBit Arena

## What's already covered

The repo ships with **517 tests across 51 files** — 369 unit tests in 33 files and 148 integration tests in 18 files. Every API route, every Zod schema, every Nostr event builder, and every Lightning helper has at least one direct test.

### Unit tests (`tests/unit/` — 33 files, 369 tests)

Fast, mocked-DB tests for handler logic, schema validation, and pure helpers. All pass with no external services configured.

**API routes (mocked DB):**

| Test file | What it covers |
|---|---|
| `auth.test.ts` | Session helpers, JWT issue/verify, cookie name selection |
| `auth-routes.test.ts` | `POST /api/auth/nostr` (NIP-98), `GET /api/auth/session`, `POST /api/auth/signout` |
| `challenges.test.ts` | `POST /api/challenges` validation, list filters, sort, cursor pagination |
| `challenge-detail.test.ts` | `GET/PATCH/DELETE /api/challenges/[id]` auth + ownership |
| `completions.test.ts` | Proof submission validation, verification-method routing |
| `join.test.ts` | `POST /api/challenges/[id]/join` — duplicate, expired, creator-self gate |
| `award.test.ts` | `POST /api/challenges/[id]/award` — winner list shape, kind:8 ids |
| `verify.test.ts` | Creator approve/reject endpoints — status transitions, progress bumps |
| `zap-status.test.ts` | `POST /api/zap/status` — NWC `lookupInvoice` mapped to `{paid}` |

**Schemas (`tests/unit/schemas/`):**

`profile`, `nostr`, `pagination`, `challenges-schema`, `primitives`, `completions` — every Zod schema's accept / reject paths.

**API wrapper layer (`tests/unit/api/`):**

`errors`, `translate-error`, `parse`, `rate-limit`, `verification-methods`, `handler` — covers the `apiHandler` wrapper, structured `apiError` codes, locale-aware error translation, JSON parsing helpers, in-memory rate limiter, and the verification-method helper.

**Nostr layer (`tests/unit/nostr/`):**

| Test file | What it covers |
|---|---|
| `validate-auth-event.test.ts` | NIP-98 kind:27235 binding (`u`, `method`, replay window, signer-type tag) |
| `events.test.ts` | Event builders for kinds 30100, 7100, 7101, 30101, 9041, 9734 |
| `lnurl.test.ts` | LNURL-pay endpoint resolution + invoice fetch shape |
| `fetch-zap-receipts.test.ts` | NIP-75 aggregation: dedupe, exclude creator, validate signatures |
| `zap-goal-progress.test.ts` | Pure progress calc from receipts |
| `auth-errors.test.ts` | Structured `AuthError` → user-facing message map |
| `blossom.test.ts` | BUD-01/02 kind:24242 upload-auth event shape |
| `fetch-events.test.ts` | Relay subscription helper: timeout, abort, dedupe |

**Other:**

`lightning.test.ts` (BOLT11 payment-hash extraction), `utils.test.ts` (cn / clamp / etc.), `validate-form.test.ts`, `http-url-schema.test.ts`.

### Integration tests (`tests/integration/` — 18 files, 148 tests)

Run against a real Neon Postgres test branch and exercise the full request → Drizzle → DB path. Require `.env.test` (see [§ Environment Setup](#environment-setup)).

| Test file | What it covers |
|---|---|
| `profile.test.ts` | `GET/PUT/DELETE /api/profile` + relay sync (`/sync`) |
| `challenges.test.ts` | List + create — real cursor pagination, real tag joins |
| `challenges-follow.test.ts` | NIP-02 follow-pubkeys boost in the Explore query |
| `join.test.ts` | Join row insert, unique constraint, leave + re-join |
| `completions-verify.test.ts` | Creator approve/reject with progress + status updates |
| `checkpoint-verify.test.ts` | Per-checkpoint approve, sequential lock unlock |
| `checkpoints.test.ts` | Progression: parallel vs. sequential, completion side-effects |
| `pending-checkpoint-submissions.test.ts` | Creator's pending review list |
| `nostr-action-verify.test.ts` | NIP-25 (kind:7 reaction) auto-verification end to end |
| `nostr-hashtag-verify.test.ts` | kind:1 hashtag-note auto-verification end to end |
| `award.test.ts` | kind:30009 lazy publish + kind:8 award persisting `event_id` |
| `my-badges.test.ts` | Recipient's badge list with creator + challenge join |
| `badges-accept.test.ts` | kind:30008 profile-badges merge (preserve other apps' tags) |
| `zap-goal-progress.test.ts` | NIP-75 aggregation against the live progress endpoint |
| `reward.test.ts` | `POST /api/challenges/[id]/reward` — distribution math, retained-creator, idempotency, `all_winners_paid` flag gates `rewards_paid_at` |
| `notifications.test.ts` | List, mark-one-read, mark-all-read, ownership enforcement |
| `notifications-emission.test.ts` | Per-type emission paths + self-trigger skip rules |
| `popular-tags.test.ts` | Tag aggregation query |

### What's deliberately **not** unit/integration-tested

- **UI components** — there's no React Testing Library suite. Visual changes are validated manually in the browser. The few interactive components with non-trivial logic (`ZapGoalProgress`, `FundPotModal`, `CardZapGoalBar`) get their data layer covered indirectly through the integration tests behind their fetch endpoints.
- **End-to-end browser tests** — no Playwright / Cypress. The judge walkthrough in [`testing-plan.md`](testing-plan.md) is the manual E2E.
- **Real Lightning payments** — `lnurl.test.ts` mocks the LNURL response; `zap-status.test.ts` mocks the NWC client. The actual settlement loop is exercised manually via the walkthrough.

## Test Structure

```
tests/
  setup.ts              ← Shared setup (jest-dom matchers)
  helpers.ts            ← Unit test helpers (mock factories, request builders)
  unit/                 ← Fast tests with mocked DB
    schemas/            ← Zod schema accept/reject coverage
    api/                ← apiHandler wrapper + helpers
    nostr/              ← Event builders, NIP validators, relay helpers
  integration/          ← Full-stack tests against real Neon test DB
    setup.ts            ← Loads .env.test, creates DB connection, cleanup
    helpers.ts          ← Seed functions, session mock, request builders
```

## Two Test Layers

### Unit Tests (`tests/unit/`)

Unit tests **mock the database** and test route handler logic in isolation: input validation, auth checks, error responses, and response format. They never make network calls.

Why skip the real DB?

- **Speed**: Unit tests run in ~2 seconds. Integration tests take ~2 minutes because each query is an HTTP round-trip to Neon.
- **Reliability**: No network dependency means no flaky tests from DNS, latency, or connection limits.
- **Focus**: Validation logic (`title.length < 3 → 400`) doesn't need a real database to prove it works. Mocking lets us test handler logic without the noise of seeding data and cleaning up.
- **CI cost**: Unit tests run without any secrets or external services, so they work in any environment — local, CI, or a fresh clone.

### Integration Tests (`tests/integration/`)

Integration tests hit the **real Neon test database** and verify the full request → Drizzle ORM → PostgreSQL flow. They catch problems that mocks can't: wrong column names, FK constraint violations, bad joins, incorrect progress/status updates across related tables.

These tests:
- Load credentials from `.env.test` (local) or GitHub secrets (CI)
- Seed real data before each test, clean up after
- Run sequentially (`--fileParallelism=false`) because they share one database
- Still mock `getSession()` since there's no real HTTP request with cookies

## Running Tests

```bash
npm test                 # Run all tests (unit + integration)
npm run test:unit        # Unit tests only (~2s, no .env.test needed)
npm run test:integration # Integration tests only (~2min, needs .env.test)
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

A clean checkout without `.env.test` will see `npm run test:unit` pass cleanly (369/369). The integration suite errors out at setup until the test branch is configured — that's expected.

## Environment Setup

Integration tests require a `.env.test` file with a Neon test branch connection:

```bash
cp .env.example .env.test
# Edit .env.test with your Neon test branch credentials
```

Then run migrations on the test branch:

```bash
export $(grep -v '^#' .env.test | xargs) && npx drizzle-kit migrate
```

## Writing Tests

### When to write a unit test
- Validating request input (missing fields, wrong types, length checks)
- Checking auth requirements (401 for unauthenticated, 403 for wrong role)
- Testing error responses for edge cases
- Any logic that doesn't depend on data relationships between tables

### When to write an integration test
- CRUD operations that should persist and be retrievable
- Multi-step flows (create → join → submit → verify → award)
- Business logic that depends on real data (participant counts, progress tracking, goal completion)
- Edge cases involving FK constraints or unique indexes (duplicate join, duplicate badge)
