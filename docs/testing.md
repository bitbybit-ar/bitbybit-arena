# Testing Guide — BitByBit Arena

## Test Structure

```
tests/
  setup.ts              ← Shared setup (jest-dom matchers)
  helpers.ts            ← Unit test helpers (mock factories, request builders)
  unit/                 ← Fast tests with mocked DB
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
npm run test:unit        # Unit tests only (~2s)
npm run test:integration # Integration tests only (~2min, needs .env.test)
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

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
