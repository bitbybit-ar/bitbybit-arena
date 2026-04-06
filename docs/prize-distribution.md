# Prize Distribution

## Overview

Challenge creators can fund challenges with sats. When winners are determined, prizes are distributed via Lightning Network. The system supports multiple distribution rules and payment methods.

## Prize Funding

### How Creators Fund a Challenge

1. Creator sets a prize amount when creating the challenge
2. Creator's wallet (NWC or WebLN) sends sats to the app's custodial holding
3. Sats are held until the challenge ends and winners are determined
4. If the challenge is cancelled, sats are returned to the creator

**Alternative (non-custodial):** Creator zaps the challenge event (NIP-57 zap to kind: 30100). Prize pool = sum of zaps to the challenge. Distribution requires creator to manually zap winners. Simpler but less automated.

### Prize Pool via Zap Goals (NIP-75)

For community-funded challenges:
1. Creator publishes a Zap Goal (kind: 9041) linked to the challenge
2. Anyone can zap the goal to add to the prize pool
3. Goal progress is visible in the challenge card
4. When goal is reached (or challenge ends), prizes are distributed

## Distribution Rules

The creator selects a rule when creating the challenge:

### First to Complete
- Prize goes to the first N participants who complete the challenge
- Example: "First 3 to run a 5K get 5,000 sats each"
- Payout is instant upon verified completion

### Winner Takes All
- Single winner gets the entire prize pool
- Winner determined by: most points, creator's choice, community vote
- Payout at challenge end

### Tiered (Podium)
- 1st, 2nd, 3rd place get different amounts
- Example: 1st = 50%, 2nd = 30%, 3rd = 20%
- Payout at challenge end

### Split Among Completers
- Prize pool divided equally among all who complete the challenge
- Example: 50,000 sats split among 10 completers = 5,000 each
- Payout at challenge end

### No Prize (Badge Only)
- No sats involved, just a NIP-58 badge
- Simplest option, no payment complexity

## Payment Methods

### 1. Direct Zap (Preferred for MVP)

Creator zaps the winner's Nostr pubkey using NIP-57.

**Flow:**
1. Challenge ends, winners determined
2. App generates zap request (kind: 9734) to winner's Lightning address
3. Creator's wallet (NWC/WebLN) pays the invoice
4. Zap receipt (kind: 9735) published to Nostr
5. Winner receives sats in their Lightning wallet

**Advantages:**
- Non-custodial (app never holds sats)
- Transparent (zap receipts are public)
- Uses existing Nostr infrastructure

**Requirement:** Winners must have a Lightning address or LNURL in their Nostr profile (kind: 0 metadata, `lud16` or `lud06` field).

### 2. NWC Auto-Pay (Fallback)

If the creator has connected a wallet via NWC:
1. App creates an invoice from the winner's wallet
2. App pays the invoice using creator's NWC connection
3. Payment confirmed via NWC callback

### 3. Manual Payment

If automated payment fails:
1. App shows the winner's Lightning address/invoice to the creator
2. Creator pays manually from any Lightning wallet
3. Creator confirms payment in-app
4. App publishes the challenge result event

## Community Zaps

Independent of prizes, any Nostr user can zap completion events:

- See an impressive photo proof? Zap it
- Want to encourage a participant? Zap their completion
- This creates organic, social-driven rewards beyond the formal prize

Zaps on completion events use standard NIP-57 — no custom logic needed.

## Flow Diagram

```
Challenge Created (with prize: 10,000 sats)
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
  Zap winners  Award badges (kind: 8)
  (kind: 9734/9735)
    |
    v
  Award badges (kind: 8)
```

## Edge Cases

- **Winner has no Lightning address**: Show message asking them to add one to their Nostr profile. Hold prize for 7 days, then return to creator.
- **Creator wallet has insufficient funds**: Notify creator, allow retry. Challenge result still published.
- **Challenge cancelled with funded prize**: Return sats to creator via NWC or show refund instructions.
- **Dispute on winner**: Creator has final say for `creator_approval` challenges. For `community_vote`, majority rules.

## Security

- App never holds private keys
- NWC connections encrypted (AES-256-GCM, same as habits)
- Prize amounts validated server-side
- Rate limiting on prize claims
- Zap receipts verified against relay responses
