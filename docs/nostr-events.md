# Nostr Event Design

## Overview

BitByBit Arena uses standard Nostr NIPs where possible and defines custom event kinds for challenge-specific functionality. All events are published to Nostr relays, making challenges discoverable by any client.

## NIPs Used

| NIP | Purpose | How we use it |
|-----|---------|---------------|
| **NIP-01** | Basic protocol | Event structure, relay communication |
| **NIP-07** | Browser extension | Login with Nostr identity (nos2x, Alby, etc.) |
| **NIP-57** | Lightning Zaps | Community zaps on completions (client-side only) |
| **NIP-58** | Badges | Achievement badges tied to Nostr identity |
| **NIP-75** | Zap Goals | Prize pool funding for challenges |
| **NIP-25** | Reactions | Likes/reactions on challenges and completions |
| **NIP-10** | Reply threading | Comments on challenges |

## Custom Event Kinds

We need custom event kinds for challenge-specific actions. These use kinds in the 30000-39999 range (parameterized replaceable events) and 1000-9999 range (regular events).

### Challenge Definition (kind: 30100)

Parameterized replaceable event. The `d` tag is the challenge unique identifier.

```json
{
  "kind": 30100,
  "content": "Detailed challenge description with rules and instructions",
  "tags": [
    ["d", "<challenge-slug>"],
    ["title", "30-Day Cold Shower Challenge"],
    ["summary", "Take a cold shower every day for 30 days"],
    ["image", "<url-to-challenge-banner>"],
    ["t", "fitness"],
    ["t", "health"],
    ["type", "streak"],
    ["start", "<unix-timestamp>"],
    ["end", "<unix-timestamp>"],
    ["goal", "30"],
    ["unit", "days"],
    ["verification", "creator_approval"],
    ["prize", "10000", "sats", "first_to_complete"],
    ["badge", "<kind:30009-event-id>"],
    ["status", "open"]
  ]
}
```

**Notes:**
- `type`: one of `one_time`, `streak`, `competition`, `race`, `creative`
- `verification`: one of `creator_approval`, `community_vote`, `automatic` (honor system)
- `prize` tag: amount, unit, distribution rule
- `badge` tag: references a NIP-58 badge definition to award on completion
- `status`: `open`, `in_progress`, `completed`, `cancelled`
- Creator can update the event (same `d` tag) to change status

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
- `content`: text description of the completion (text-only for MVP)
- `progress` tag: current/total for streak/competition challenges
- `step` tag: which step number this submission is for

### Completion Verification (kind: 7102) — post-MVP, not yet published

**Status:** not published by the MVP. Verification state lives inline on the `completions` row (`status`, `reviewed_by`, `reviewed_at`) and is set via `POST /api/completions/[id]/verify`. See [proof-of-completion.md — Verification architecture](./proof-of-completion.md#verification-architecture-mvp) for the rationale.

The schema below is the planned shape of the event for a follow-up release, which will mirror DB decisions to relays so that verifications become publicly auditable and `community_vote` tallies become possible.

```json
{
  "kind": 7102,
  "content": "Verified! Great job.",
  "tags": [
    ["e", "<completion-event-id>"],
    ["a", "30100:<creator-pubkey>:<challenge-d-tag>"],
    ["p", "<submitter-pubkey>"],
    ["status", "approved"]
  ]
}
```

**Notes:**
- `status`: `approved` or `rejected`
- Once shipped, `community_vote` verification will tally multiple kind:7102 events from distinct participants; that verification method is currently rejected by the API validators.

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

## Event Flow Diagram

```
Creator                          Participants                    Nostr Network
  |                                   |                              |
  |-- kind:30009 (Badge Def) -------->|                              |
  |-- kind:30100 (Challenge) -------->|----------------------------->|
  |                                   |                              |
  |                 kind:7100 (Join) <|----------------------------->|
  |                                   |                              |
  |           kind:7101 (Completion) <|----------------------------->|
  |                                   |                              |
  |-- (verify: DB-only in MVP) ---x   |                              |
  |-- kind:7102 (Verify, post-MVP) ->|----------------------------->|
  |-- kind:8 (Badge Award) --------->|----------------------------->|
  |-- kind:9734/9735 (Zap Prize) --->|----------------------------->|
  |                                   |                              |
  |-- kind:30101 (Results) --------->|----------------------------->|
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

**Note**: kinds 30100 (Challenge Definition), 7100 (Challenge Join), 7101 (Completion Submission), and 30101 (Challenge Result) are custom BitByBit kinds. NIP-113 (Activity Events, not yet merged) also proposes kind 30100, so we may need to migrate before any conflicting standard lands. kind:7102 (Completion Verification) is documented above as a post-MVP extension and is not yet emitted.
