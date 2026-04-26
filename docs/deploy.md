# Deployment Guide — BitByBit Arena

Production URL: `https://arena.bitbybit.com.ar`

## 1. Neon Database Branches

Two branches are required, plus an optional third if you want preview deploys to run against isolated data:

| Branch | Purpose | Used by |
|--------|---------|---------|
| `main` | Production data | Vercel Production (`DATABASE_URL`), and the post-merge `migrate` job in `.github/workflows/ci.yml` (`DATABASE_URL_DIRECT`) |
| `test` | Automated test data | GitHub Actions CI (`TEST_DATABASE_URL`) — the same branch is used for both the `Migrate test DB` and `Integration tests` steps |
| `dev` *(optional)* | Preview/staging data | Vercel Preview deploys, if you want previews to write to a separate branch |

Each branch has its own connection string. Copy them from the Neon dashboard.

After creating branches, run migrations on each:

```bash
DATABASE_URL="<branch-connection-string>" npm run db:migrate
```

## 2. Vercel Project Setup

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import the `bitbybit-ar/bitbybit-arena` repository
3. Framework: **Next.js** (auto-detected)
4. Root directory: `.` (default)
5. Build command: `npm run build` (default)
6. Install command: `npm ci`
7. Node.js version: **20.x**
8. Production branch: `main`

### Environment Variables

Set these in **Project Settings → Environment Variables**:

| Variable | Production | Preview |
|----------|-----------|---------|
| `DATABASE_URL` | Neon `main` branch URL | Neon `dev` branch URL |
| `AUTH_SECRET` | `openssl rand -base64 32` | Different random value |
| `NEXT_PUBLIC_BASE_URL` | `https://arena.bitbybit.com.ar` | _(leave empty — Vercel auto-sets)_ |
| `NEXT_PUBLIC_ZAP_LIGHTNING_ADDRESS` | A lud16 you control (e.g. from Alby, Primal, Mutiny) | Same as production, or a separate test address |

> Set each variable's **Environment** scope (Production / Preview) individually in the Vercel UI.

## 3. Domain Configuration

### On Vercel
1. Go to **Project Settings → Domains**
2. Add `arena.bitbybit.com.ar`

### DNS Record
Add a CNAME record where `bitbybit.com.ar` is managed:

```
Type:  CNAME
Name:  arena
Value: cname.vercel-dns.com
```

Vercel will auto-provision an SSL certificate once DNS propagates.

## 4. GitHub Actions CI

The CI workflow (`.github/workflows/ci.yml`) runs on every PR to `main` and on push to `main`. Steps in order:

- TypeScript type checking (`npx tsc --noEmit`)
- ESLint (`npm run lint`)
- Unit tests (`npm run test:unit`) — fast, mocked DB
- `Migrate test DB` (`npm run db:migrate` against `TEST_DATABASE_URL`) so the integration suite always runs against the latest schema
- Integration tests (`npm run test:integration`) — real Neon test DB
- Next.js production build (`npm run build`) — exercises the same env vars production needs

A second `migrate` job runs only on push to `main` and applies migrations to the production branch via `DATABASE_URL_DIRECT`.

The workflow is gated by a single concurrency group (`ci-shared-test-db`, no cancel-in-progress) because the integration suite truncates the shared test database between runs — racing two PRs would let one wipe the other's seeded users mid-test.

### GitHub Secrets

Go to **Repository Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `TEST_DATABASE_URL` | Neon `test` branch connection string (used by integration tests + the `Migrate test DB` step + the `Build` step) |
| `TEST_AUTH_SECRET` | Any random string (e.g. `openssl rand -base64 32`) |
| `DATABASE_URL_DIRECT` | Neon `main` branch connection string — only used by the post-merge `migrate` job |

## 5. Branch Protection Rules

Go to **Repository Settings → Rules → Rulesets** (or Branch protection rules):

- **Branch**: `main`
- **Require a pull request before merging**: Enabled
- **Require status checks to pass**: Enable and add the `ci` job
- **Do not allow bypassing the above settings**: Recommended

## 6. Deploy Workflow

```
feature branch → PR → CI checks pass → review → merge to main → Vercel auto-deploys to production
```

Preview deployments are created automatically for every PR by Vercel.
