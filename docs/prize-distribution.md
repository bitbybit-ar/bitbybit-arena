# Prize Distribution

## Overview

Prizes are handled entirely through Nostr zaps (NIP-57) — no server-side Lightning infrastructure, no invoices, no wallet management. The app facilitates zaps but never holds or processes sats.

## How It Works

### Community Zaps (NIP-57)

Any Nostr user can zap challenge completions they find impressive. This is the primary reward mechanism:

- See a great completion? Zap it
- Want to encourage a participant? Zap their submission
- The sender's own wallet (Alby, Zeus, etc.) handles the payment
- Zap receipts (kind: 9735) are public on Nostr

The app displays zap counts and totals on completions — no custom logic needed beyond reading zap receipt events from relays.

### Zap Goals for Prize Pools (NIP-75)

For challenges with a funded prize:

1. The client **auto-publishes** a Zap Goal (kind 9041) linked to the challenge at creation time. There is no opt-in toggle — without the goal on relay, supporters would have no way to fund the pot. If the publish fails, the creator sees a "Republish zap goal" button on the detail page.
2. **Anyone** can fund the pot from the challenge detail page via the **"Fund this pot"** modal, which signs a NIP-57 kind 9734 zap request that `e`-tags the goal event and `p`-tags the creator. The sats land in the creator's Lightning wallet and the kind:9735 receipt is public on relays. Supporters with their own Nostr client can also zap the goal directly without leaving their client.
3. **Progress is visible** in two places:
   - Explore cards render a compact progress bar (`ZapGoalBar`) fed by a cached server snapshot at `GET /api/challenges/[id]/zap-goal-progress` (45s TTL).
   - The challenge detail page renders the full `ZapGoalProgress` panel — raised/goal sats, zapper count, and the 8 most recent zappers with avatars and optional messages — live via a relay subscription so new zaps appear without a reload.
4. When the creator clicks **"Distribute rewards"** after the challenge ends, the app drives a client-side NIP-57 payout loop across the winner list. See [docs/nostr-flows.md](./nostr-flows.md) for the full sequence.

**Important:** The app does NOT custody sats or issue invoices. Both the supporter funding flow and the creator payout flow run WebLN → QR + NWC-polling fallbacks in the browser.

## Distribution Rules

The creator selects a rule when creating the challenge. The field on the `challenges` row is `prize_distribution`, one of:

### First to Complete
- The earliest participant to reach `status='completed'` takes the full pot
- `prize_distribution = "first_to_complete"`

### Split Among Completers
- Prize divided equally among every completer; rounding remainder added to the first-place winner
- `prize_distribution = "split"`

### Tiered Podium
- Top 3 by completion time, split 50% / 30% / 20%
- If fewer than 3 completers exist, the weights renormalize over the available slots (the full pot is always paid out)
- `prize_distribution = "tiered"`

### No Prize (Badge Only)
- No sats involved, just a NIP-58 badge
- Simplest option, expected to be the most common
- `prize_distribution = "none"` (or left null with `prize_amount_sats = 0`)

## What the App Does vs Doesn't Do

| App does | App does NOT do |
|----------|-----------------|
| Auto-publish a NIP-75 Zap Goal for every prized challenge | Create Lightning invoices |
| Aggregate kind:9735 zap receipts into live goal progress | Hold or custody sats |
| Drive a WebLN / QR-fallback payment loop for funding and payouts | Auto-pay winners |
| Display winner list with amounts due | Connect to user wallets (NWC from the client) |
| Construct kind:9734 zap requests (funding + payout) | Process payments server-side |

Server-side NWC is used **only** by `/api/zap/status` to poll whether an invoice we handed out has been paid — the creator's sats never touch our backend.

## Requirements for Zapping

- **Sender** (supporter funding a pot, or creator paying a winner) needs a Lightning wallet with NIP-57 support (Alby, Zeus, Damus, etc.) — or WebLN + a browser extension, or any wallet that can pay a BOLT11 from a QR.
- **Recipient** (creator for funding, winner for payout) needs a Lightning address (`lud16`) on their Nostr kind:0 profile. Without it, the server's payout route 400s with a message naming the winner.

## Flow Diagram

```
Challenge Created with prize
       |
       v
kind:30100 Challenge Definition  +  kind:9041 Zap Goal   (auto-published)
       |
       v
Supporters fund the pot (kind:9734 → kind:9735 on the goal)
       |
       v
Participants join and compete
       |
       v
Challenge ends / completers determined
       |
   +---+---+
   |       |
   v       v
 Prize?   Badge only
   |         |
   v         v
Distribute  Award badges (kind:8)
rewards
   |
   v
Creator pays each winner (kind:9734 → kind:9735 per winner)
   |
   v
PATCH /reward { all_winners_paid: true }  (stamps rewards_paid_at)
   |
   v
kind:30101 Challenge Result published
   |
   v
Award badges (kind:8)
```
