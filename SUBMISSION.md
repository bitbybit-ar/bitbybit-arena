# BitByBit Arena — Judge Quickstart

Five minutes from cloning to exercising the end-to-end Nostr + Lightning prize flow. If you want depth, jump to [`docs/testing-plan.md`](./docs/testing-plan.md) once the basics work.

## What you're evaluating

A Nostr-native client (`arena.bitbybit.com.ar`) where anyone can create timed challenges, compete, and win sats + NIP-58 badges. The interesting Nostr surface:

| NIP | Where it shows up |
|---|---|
| **NIP-01 / 07 / 19 / 46** | Sign in via browser extension, `nsec1…` paste, or Nostr Connect bunker |
| **NIP-57 zaps** | Supporters fund prize pots; creators pay winners — client-side only, no custody |
| **NIP-58 badges** | `kind:30009` definitions, `kind:8` awards, `kind:30008` profile merges |
| **NIP-75 zap goals** | `kind:9041` auto-published per prized challenge, receipts aggregated live |
| **NIP-92 imeta** | Attached to completions + badge images via Blossom content-addressed uploads |
| **NIP-98 HTTP Auth** | `kind:27235` on the `POST /api/auth/nostr` login — no password, no OAuth |
| **Custom kinds** | `30100` challenge, `7100` join, `7101` completion, `30101` result |

## 1. Prereqs

- Node 20+ (CI runs 22 — anything in that range works)
- A Nostr identity (extension like Alby / nos2x, or an `nsec1…` you can paste, or Amber/nsec.app for NIP-46)
- **For payout testing**: a Lightning address you control (any Alby / Primal / Mutiny / Phoenix account gives you a `you@getalby.com`-style address)
- A Neon Postgres URL (or any Postgres — the app uses the serverless driver but plain Postgres works locally)

## 2. Install and configure

```bash
git clone https://github.com/bitbybit-ar/bitbybit-arena
cd bitbybit-arena
npm install
cp .env.example .env.local
```

Edit `.env.local` — the four that matter for the prize flow:

```env
DATABASE_URL=postgres://…                    # your Neon/Postgres URL
AUTH_SECRET=<run: openssl rand -base64 32>
NEXT_PUBLIC_ZAP_LIGHTNING_ADDRESS=you@getalby.com   # a lud16 you control
SEED_OWNER_PUBKEY=npub1…                     # your own npub (or 64-char hex)
```

Optional:
- `NWC_CONNECTION_URL=nostr+walletconnect://…` — needed only if you want the QR + NWC fallback to auto-advance. Grab it from Alby/Primal. If you have a WebLN browser extension, skip it.

## 3. Migrate and seed

If you skipped `npm install` above (or want a clean lockfile-pinned install for repro), run it now:

```bash
npm ci
npm run db:migrate
npm run db:seed
```

The seeder logs the owner pubkey at startup:

```
[seed] Demo challenges will be owned by <your-hex>. Log in with this pubkey to test the creator payout flow.
```

## 4. Run

```bash
npm run dev
```

Visit `http://localhost:3000`, click **Sign in**, use whichever method matches the pubkey you put in `SEED_OWNER_PUBKEY`.

## 5. Exercise the three core flows

### 5.1 Supporter funding (NIP-75)

1. Open Explore → any seeded challenge with a prize (the card shows a gold progress bar under the reward row).
2. Click **Fund this pot** (or "Be the first to fund it" on an empty pot).
3. Pick an amount, optionally write a message, hit Fund. WebLN pays silently; otherwise a QR appears.
4. Within a few seconds the detail page's progress bar ticks up live and your avatar + message appears in the Recent Zappers list — no page reload.

Verification: look up the challenge's `zap_goal_event_id` on `njump.me/<event-id>` and see the kind:9735 receipts `e`-tagging it.

### 5.2 Creator payout (NIP-57)

1. Open **"Demo: Tiered Prize Payout"** in Explore. You'll see it as the creator (because `SEED_OWNER_PUBKEY` matched) — three mock participants are already completed with staggered times so the podium is deterministic.
2. Click **Distribute rewards**. Server computes: 1st = 5000 sats, 2nd = 3000 sats, 3rd = 2000 sats.
3. Pay each invoice (WebLN auto-pays; the QR fallback polls `/api/zap/status` with your NWC wallet). All three payouts route to `NEXT_PUBLIC_ZAP_LIGHTNING_ADDRESS`.
4. After the last winner, the client publishes a `kind:30101` Challenge Result event with winner + stats tags.

Verification: the event id is persisted on `challenges.result_nostr_event_id`; fetch it from any relay or `njump.me`.

**Crash-safety (with one residual gap)**: the server only stamps `rewards_paid_at` when the client explicitly `PATCH`es `{all_winners_paid: true}` after the last payout settles, so the challenge can never silently flip into "paid" state on a partial run. The residual gap: per-winner `reward_zap_receipt_id` bookkeeping isn't wired up yet (`docs/nostr-flows.md:202–204`), so if you pay winner 1 and the tab closes before winner 2, retrying `Distribute rewards` re-offers all three winners — including winner 1, who's already received their sats. Workaround for the demo: pay all three in one go without closing the tab. Closing this gap cleanly is tracked as a follow-up.

### 5.3 Badges (NIP-58)

1. Still on the demo challenge, click **Award badges**, pick winners. The client publishes one `kind:8` award per recipient, `a`-tagging a `kind:30009` badge definition (lazy-published on first award if it wasn't emitted at creation).
2. To exercise the **recipient** flow (Accept on Nostr → `kind:30008` profile-badges event with merge-preserve), the demo seeded participants are mocks and you don't hold their private keys, so create a quick second challenge instead: open `/create` from a different nsec / browser profile, join + complete it from your main account, award yourself, then sign back in as your main account and click **My Challenges → Achievements → Accept on Nostr**. The full walkthrough in [`docs/testing-plan.md`](./docs/testing-plan.md) Step 10 covers this end-to-end.

## Where to look in the code

| What | File |
|---|---|
| Challenge event builders | `lib/nostr/events.ts` |
| NIP-75 goal progress aggregation | `lib/nostr/fetch-zap-receipts.ts`, `lib/hooks/useZapGoalProgress.ts` |
| NIP-57 payout loop | `app/[locale]/(app)/explore/[id]/challenge-client.tsx` (`payWinner`) |
| Post-payment receipt capture | `lib/nostr/await-zap-receipt.ts` |
| NIP-98 login | `app/api/auth/nostr/route.ts`, `lib/signer-context.tsx` |
| Reward API + idempotency | `app/api/challenges/[id]/reward/route.ts` |
| Fund-the-pot modal | `components/challenges/FundPotModal/` |
| Seed script | `scripts/seed.ts` |

## Troubleshooting

- **"Winner X has no lightning address on their Nostr profile"** — `NEXT_PUBLIC_ZAP_LIGHTNING_ADDRESS` isn't set, or the address isn't resolving. The seeder propagates it to every mock user; check your `.env.local` and re-run `npm run db:seed`.
- **QR modal never advances** — you're on the NWC fallback path and `NWC_CONNECTION_URL` isn't set. Pay the invoice manually and refresh, or set the env var.
- **"Distribute rewards" button is missing** — you're signed in with a different pubkey than `SEED_OWNER_PUBKEY`. The server gates the button on creator match. Sign out and sign back in with the right identity.
- **Goal progress panel shows 0** — `zap_goal_event_id` wasn't published at creation. If you created the challenge yourself and see a creator-only **Republish zap goal** button, click it. Otherwise the kind:9041 event was never emitted and supporters can't fund the pot.

## Full walkthrough

When you want to exercise the checkpointed / hashtag-verified / follow-boosted flows too, jump to [`docs/testing-plan.md`](./docs/testing-plan.md) — eleven ordered steps, each naming the button label and event kind.
