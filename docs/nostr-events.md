# Nostr Event Design

## Overview

BitByBit Arena uses standard Nostr NIPs where possible and defines custom event kinds for challenge-specific functionality. All events are published to Nostr relays, making challenges discoverable by any client.

## NIPs Used

| NIP | Purpose | How we use it |
|-----|---------|---------------|
| **NIP-01** | Basic protocol | Event structure, relay communication |
| **NIP-02** | Follow list (kind 3) | Boost challenges from followed creators/joiners in Explore |
| **NIP-07** | Browser extension | One of three sign-in methods on `/signin` |
| **NIP-19** | bech32 encoding | Decode pasted `nsec1...` for the local signer |
| **NIP-25** | Reactions (kind 7) | `nostr_action` verification path: a like on a pinned note auto-approves the completion |
| **NIP-46** | Nostr Connect / bunker | Remote signing from mobile Nostr apps (Amber, nsec.app, Damus) |
| **NIP-57** | Lightning Zaps | Community zaps (kind 9734 request, 9735 receipt). Prize payouts use the same flow with a WebLN or QR fallback. |
| **NIP-58** | Badges | Kind 30009 definition, kind 8 award, kind 30008 profile badges (merge-preserve) |
| **NIP-75** | Zap Goals (kind 9041) | Prize pool funding for challenges |
| **NIP-92** | File metadata | `imeta` tags on completion + badge events to attach Blossom uploads |
| **NIP-98** | HTTP Auth (kind 27235) | `POST /api/auth/nostr` login — signed event in the Authorization header |
| **Blossom BUD-01/02** | Content-addressed media | Image uploads for completion proofs and badge artwork |

## Custom Event Kinds

We need custom event kinds for challenge-specific actions. These use kinds in the 30000-39999 range (parameterized replaceable events) and 1000-9999 range (regular events).

### Challenge Definition (kind: 30100)

Parameterized replaceable event. The `d` tag is the challenge unique identifier. Emitted by `buildChallengeEvent` in `lib/nostr/events.ts`.

```json
{
  "kind": 30100,
  "content": "Detailed challenge description with rules and instructions",
  "tags": [
    ["d", "<challenge-slug>"],
    ["title", "30-Day Cold Shower Challenge"],
    ["t", "fitness"],
    ["t", "health"],
    ["type", "streak"],
    ["start", "<unix-timestamp>"],
    ["end", "<unix-timestamp>"],
    ["goal", "30"],
    ["unit", "days"],
    ["verification", "creator_approval"],
    ["badge", "<badge-name>"],
    ["badge_image", "<url-to-badge-image>"],
    ["status", "open"]
  ]
}
```

**Notes:**
- `type`: one of `one_time`, `streak`, `competition`, `race`, `creative`.
- `verification`: one tag per enabled method. Values: `creator_approval`, `automatic`, `nostr_action`, `nostr_hashtag`.
- `badge` and `badge_image`: name + optional image URL for the NIP-58 badge awarded on completion. The kind:30009 Badge Definition event is a **separate event** published by the creator with the same `d` tag as the challenge slug — see "Badge Definition" below. Strict NIP-58 clients resolve the badge via that 30009 event, not the `badge` tag here.
- **Prize data is not emitted on kind:30100.** The prize amount, distribution rule, and zap-goal event id live on the DB row and are surfaced to Nostr via a separate NIP-75 Zap Goal (kind 9041) event — see the "Zap Goal" section.
- `status`: `open`, `in_progress`, `completed`, `cancelled`.
- Creator can update the event (same `d` tag) to change status.

### Challenge Join (kind: 7100)

Regular event. User signals they're joining a challenge.

```json
{
  "kind": 7100,
  "content": "",
  "tags": [
    ["a", "30100:<creator-pubkey>:<challenge-d-tag>"],
    ["p", "<creator-pubkey>"]
  ]
}
```

### Completion Submission (kind: 7101)

Regular event. User submits proof of completing a challenge (or a step in a streak).

```json
{
  "kind": 7101,
  "content": "Day 15 done! The water was freezing but I survived.",
  "tags": [
    ["a", "30100:<creator-pubkey>:<challenge-d-tag>"],
    ["p", "<creator-pubkey>"],
    ["progress", "15", "30"],
    ["step", "15"]
  ]
}
```

**Notes:**
- `content`: text description of the completion. Completions can also carry an image — when one is attached the client uploads it to a Blossom server and mirrors the URL into the event with a sibling NIP-92 `imeta` tag (`["imeta", "url <url>", "m <mime>", "x <sha256>", "size <bytes>"]`) so the blob is content-addressable from the event alone.
- `progress` tag: current/total for streak/competition challenges
- `step` tag: which step number this submission is for

### Badge Definition (kind: 30009, NIP-58)

**Status:** shipped. Published by the challenge creator from `CreateChallengeForm` right after the `kind:30100` challenge event when a badge is defined. The signed event id is persisted on `challenges.badge_nostr_event_id` via `PUT /api/challenges/[id]`. If the initial publish fails or the challenge predates NIP-58 Phase A, `handleAwardBadges` on the explore detail page lazy-publishes the definition on first award.

Parameterized replaceable event per NIP-58. We use the challenge slug as the `d` tag so the badge identifier matches the challenge identifier and the corresponding `kind:8` Badge Award events can `a`-tag `30009:<creator-pubkey>:<challenge-slug>`.

```json
{
  "kind": 30009,
  "content": "",
  "tags": [
    ["d", "<challenge-slug>"],
    ["name", "30-Day Zen Master"],
    ["description", "Meditate every day for 30 days"],
    ["image", "https://blossom.primal.net/<sha256>.png"],
    ["imeta", "url https://blossom.primal.net/<sha256>.png", "m image/png", "x <sha256>", "size 12345"]
  ]
}
```

**Notes:**
- `name` is required per NIP-58. We use the challenge's `badge_name` field, falling back to the challenge title.
- `description` and `image` are optional; both are populated from the challenge fields when present.
- When the badge image was uploaded via Blossom (see [proof-of-completion.md — Photo (Blossom)](./proof-of-completion.md#photo-blossom)), the builder emits a sibling NIP-92 `imeta` tag alongside the `image` tag with the sha256, size, and mime type. The sha256 lets recipients pull the badge image from any Blossom mirror that holds the blob, not just the server in the URL. The `imeta` tag is omitted when we only have a plain URL (legacy lazy-publish path).
- `thumb` is supported by the builder but not currently populated.

### Badge Award (kind: 8, NIP-58)

**Status:** shipped. Published by the challenge creator from the explore detail page when awarding badges to selected winners. One `kind:8` event per recipient. The signed event id is persisted on `badges.nostr_event_id` via `PATCH /api/challenges/[id]/award` so the Achievements tab and Profile Badges opt-in flow can reference it later.

Regular event per NIP-58. MUST `a`-tag the `kind:30009` Badge Definition (not the `kind:30100` challenge event — that was a bug fixed in Phase A).

```json
{
  "kind": 8,
  "content": "",
  "tags": [
    ["a", "30009:<creator-pubkey>:<challenge-slug>"],
    ["p", "<recipient-pubkey>"]
  ]
}
```

**Notes:**
- Only the creator of the `kind:30009` definition can validly sign an award that `a`-tags it. The server enforces creator-only on `POST /api/challenges/[id]/award`; the client passes `challenge.creator.nostr_pubkey` as the issuer.
- No legacy `badge` tag: earlier Arena versions included `["badge", "<name>"]`, but NIP-58 doesn't define that tag and it was dropped in Phase A.
- If the creator awards the same badge to multiple recipients in one batch, the client publishes one `kind:8` per recipient sequentially.

### Profile Badges (kind: 30008, NIP-58)

**Status:** shipped. Published by a badge recipient from the Achievements tab on `/my-challenges` when they click "Accept on Nostr". One `kind:30008` event per user (parameterized replaceable with `d=profile_badges`), carrying pairs of `(a, e)` tags for every badge the user has accepted onto their public profile.

```json
{
  "kind": 30008,
  "content": "",
  "tags": [
    ["d", "profile_badges"],
    ["a", "30009:<issuer-pubkey>:<challenge-slug-1>"],
    ["e", "<kind-8-award-event-id-1>"],
    ["a", "30009:<issuer-pubkey>:<challenge-slug-2>"],
    ["e", "<kind-8-award-event-id-2>"]
  ]
}
```

**Notes:**
- **Preserves prior acceptances.** Before publishing, `handleAcceptBadge` fetches the user's latest `kind:30008` from relays via `fetchLatestEventOfKind`, parses out the existing `(a, e)` pairs via `parseProfileBadgesPairs`, deduplicates against the new pair, and publishes the merged set. Without this step each accept would clobber every prior accept.
- **All Accept buttons disable while any one is in flight** to prevent a race where two concurrent accepts each fetch the "latest" 30008 (neither containing the other's pending pair) and the second publish clobbers the first.
- **Parser is forgiving** of out-of-spec events: `parseProfileBadgesPairs` skips `a`-tags that aren't `30009:…` references, so a malformed upstream event doesn't poison the merge.
- **`badges.accepted_at`** on the Arena DB row is stamped via `PATCH /api/badges/[id]` after the publish succeeds. The Achievements tab flips the badge card from "Accept on Nostr" button to "On your Nostr profile" pill based on this column — not on a relay re-fetch — so the UI stays snappy.
- **Recovery from a missing award event id:** when a badge's `nostr_event_id` is null (earned before Phase A, or the `kind:8` publish failed), the Accept button surfaces an error toast rather than publishing a malformed 30008.

### Challenge Result (kind: 30101)

**Status:** shipped. Published by the challenge creator from the explore detail page right after the reward payout flow finishes (`PATCH /api/challenges/[id]/reward` returns and `rewards_paid_at` is stamped). The signed event id is persisted on `challenges.result_nostr_event_id` via `PUT /api/challenges/[id]` so the client can resolve it later without re-fetching from relays. Non-blocking on relay failure — the payments themselves already landed.

Parameterized replaceable event with `d=<slug>:results`, so each challenge has exactly one Result event per creator.

```json
{
  "kind": 30101,
  "content": "Challenge complete! Congratulations to all participants in <title>.",
  "tags": [
    ["d", "<challenge-slug>:results"],
    ["a", "30100:<creator-pubkey>:<challenge-slug>"],
    ["winner", "<pubkey>", "1st", "10000"],
    ["winner", "<pubkey>", "2nd", "5000"],
    ["completer", "<pubkey>"],
    ["stats", "participants:45", "completions:12", "total_sats:15000"]
  ]
}
```

**Notes:**
- `winner` order matches the payout order returned by `POST /api/challenges/[id]/reward`. For `first_to_complete` mode there is exactly one winner; for `tiered` there are up to three; for `split` everyone who completed.
- `place` is an English ordinal (`1st`, `2nd`, …) generated client-side. The label is consumed by third-party Nostr clients, not the Arena UI, so it isn't translated.
- `completer` tags list participants who completed the challenge but didn't make the winner cut (e.g. 4th place in a tiered challenge). Anyone already in `winner` is omitted from `completer` to avoid double-counting.
- `total_sats` in the `stats` tag is the sum of paid winner amounts, which always equals `challenges.prize_amount_sats` for a successful payout.

### Zap Goal (kind: 9041, NIP-75)

**Status:** shipped. Auto-published by `CreateChallengeForm` right after `kind:30100` for any challenge with `prize_amount_sats > 0`. The signed event id is persisted on `challenges.zap_goal_event_id`. If the initial publish fails (relay flake, no active signer), the challenge detail page surfaces a creator-only "Republish zap goal" button that re-runs the same flow — see `handleRepublishZapGoal` in `challenge-client.tsx`.

The goal event is what lets **other users fund the pot before the challenge ends**. Without it, the prize exists in the DB but is invisible to Nostr clients and can't receive zaps.

```json
{
  "kind": 9041,
  "content": "Prize pot: <challenge title>",
  "tags": [
    ["amount", "<millisats>"],
    ["relays", "wss://relay.damus.io", "wss://relay.nostr.band", "..."],
    ["a", "30100:<creator-pubkey>:<challenge-slug>"],
    ["closed_at", "<unix-timestamp>"]
  ]
}
```

**Notes:**
- `amount` is in **millisats** per NIP-75 (sats × 1000). The DB stores `prize_amount_sats` in sats and `buildZapGoalEvent` converts.
- `a` tag links the goal to the Challenge Definition so third-party clients can navigate from "prize pot" to "challenge detail" with one lookup.
- `closed_at` mirrors the challenge `ends_at` when set. Optional — omitted for open-ended challenges.

#### Funding and aggregation

Anyone can zap this event from any NIP-57 client. The LNURL provider emits a kind:9735 receipt that:
- `e`-tags the goal event id.
- Carries the signed kind:9734 zap request in its `description` tag (the embedded request's `amount` tag is the authoritative msats value).

Arena aggregates those receipts in two places so the pot progress is visible without leaving the app:

- **Server snapshot** — `GET /api/challenges/[id]/zap-goal-progress` fetches all kind:9735 events with `#e = zap_goal_event_id` from the default relay set, parses amounts out of the embedded requests, and caches the rollup (`raised_sats`, `zapper_count`, 8 most recent zappers with message) for 45s. Explore cards render a compact progress bar from this.
- **Client live subscription** — `useZapGoalProgress` opens a long-lived `REQ` per relay on the challenge detail page. New zaps dedupe by receipt id and tick the `ZapGoalProgress` panel in real time without a page reload.

### Zap Request / Receipt (kind: 9734 / 9735, NIP-57)

NIP-57 as specified. Arena constructs kind:9734 zap requests in two places:

1. **Creator → winner payout**, after `POST /api/challenges/[id]/reward`. The request `e`-tags the challenge DB id (no dedicated Nostr event id for the challenge in this context) and `p`-tags the winner. Signed by the creator, attached to the LNURL-pay callback via the `nostr` query param. The recipient's node emits the kind:9735 receipt.
2. **Supporter → zap goal funding**, from the `FundPotModal` on the detail page. The request `e`-tags the `zap_goal_event_id` and `p`-tags the creator. Same LNURL-pay flow; the sats land in the creator's wallet and the receipt feeds the progress UI above.

Both paths use the same WebLN-first / QR + NWC-polling fallback state machine (`payWinner` for payouts, `FundPotModal` for funding).

## Event Flow Diagram

```
Creator                          Participants / Supporters              Nostr Network
  |                                     |                                     |
  |-- kind:30009 (Badge Def) ---------->|                                     |
  |-- kind:30100 (Challenge) ---------->|------------------------------------>|
  |-- kind:9041 (Zap Goal) ------------>|------------------------------------>|
  |                                     |                                     |
  |               kind:7100 (Join) <----|------------------------------------>|
  |                                     |                                     |
  |         kind:7101 (Completion) <----|------------------------------------>|
  |                                     |                                     |
  |                kind:9734/9735 <-----|- (Supporters zap the goal) -------->|
  |                                     |                                     |
  |-- (verify: DB-only, no event) -x    |                                     |
  |-- kind:8 (Badge Award) ------------>|------------------------------------>|
  |-- kind:9734/9735 (Zap Payout) ----->|------------------------------------>|
  |                                     |                                     |
  |-- kind:30101 (Results) ------------>|------------------------------------>|
```

## Relay Strategy

- Publish to a default set of popular relays (e.g., relay.damus.io, relay.nostr.band, nos.lol)
- Allow users to configure their own relay list
- App reads from user's relay list (NIP-65) + default relays
- Consider running a dedicated relay for challenge events to ensure availability

## Event Kind Registry

Before launch, verify chosen kind numbers don't conflict with other proposals. Check:
- https://github.com/nostr-protocol/nips (merged NIPs)
- https://nostrbook.dev/kinds/ (known kinds in use)

**Note**: kinds 30100 (Challenge Definition), 7100 (Challenge Join), 7101 (Completion Submission), and 30101 (Challenge Result) are custom BitByBit kinds. [NIP-113](https://github.com/nostr-protocol/nips/pull/1508) (Activity Events, not yet merged) also proposes kind 30100; if it merges we'll migrate. Verification state is DB-only by design — there is no kind:7102 event, and there is no `community_vote` path (the API rejects that value).
