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

1. Creator publishes a Zap Goal (kind: 9041) linked to the challenge
2. Anyone can zap the goal to contribute to the prize pool
3. Goal progress is visible on the challenge card
4. When the challenge ends, the creator manually zaps winners

**Important:** The app does NOT custody sats or issue invoices. The creator triggers the payout from their own wallet — but the flow is now fully wired client-side: the creator clicks **"Pay winners"** on the detail page, and the app drives a WebLN payment loop for every winner (sign NIP-57 kind 9734 → resolve `lud16` → fetch invoice with the signed zap request attached → `window.webln.sendPayment`). See [docs/nostr-flows.md](./nostr-flows.md) for the full sequence.

## Distribution Rules

The creator selects a rule when creating the challenge:

### First to Complete
- The earliest participant to reach `status='completed'` takes the full pot
- `reward_zap_mode = "first_to_complete"`

### Split Among Completers
- Prize divided equally among every completer; rounding remainder added to the first-place winner
- `reward_zap_mode = "split"`

### Tiered Podium
- Top 3 by completion time, split 50% / 30% / 20%
- If fewer than 3 completers exist, the weights renormalize over the available slots (the full pot is always paid out)
- `reward_zap_mode = "tiered"`

### No Prize (Badge Only)
- No sats involved, just a NIP-58 badge
- Simplest option, expected to be the most common

## What the App Does vs Doesn't Do

| App does | App does NOT do |
|----------|-----------------|
| Display zap button on completions | Create Lightning invoices |
| Show zap counts/totals from relays | Hold or custody sats |
| Show Zap Goal progress (NIP-75) | Auto-pay winners |
| Display winner list with amounts due | Connect to user wallets (NWC) |
| Construct zap request events (kind: 9734) | Process payments server-side |

## Requirements for Zapping

- **Sender** needs a Lightning wallet with NIP-57 support (Alby, Zeus, Damus, etc.)
- **Recipient** needs a Lightning address (`lud16`) in their Nostr profile (kind: 0 metadata)
- If a winner has no Lightning address, the app shows a message asking them to add one

## Flow Diagram

```
Challenge Created (with or without prize goal)
         |
         v
    Participants join and compete
         |
         v
    Challenge ends / Winners determined
         |
         v
    kind:30101 (Results) published
         |
    +----+----+
    |         |
    v         v
  Has prize?  Badge only
    |           |
    v           v
  Show winners  Award badges (kind: 8)
  + amounts due
    |
    v
  Creator zaps winners manually
  (kind: 9734/9735)
    |
    v
  Award badges (kind: 8)
```
