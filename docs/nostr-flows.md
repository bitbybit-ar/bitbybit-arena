# Nostr Flows

This document describes the three Nostr-native flows added to BitByBit Arena on top of the base challenge platform:

1. **Nostr-action proof-of-completion** — auto-verify completions via NIP-25 kind 7 reactions
2. **Checkpoints** — sequential or parallel sub-tasks, each independently verifiable
3. **Zap rewards** — NIP-75 Zap Goals for funding + NIP-57 client-side payouts to winners

All three are optional and compose cleanly: a challenge can have any combination of them (or none).

## 1. Nostr-action proof-of-completion

### What it replaces

The legacy flow accepts a **text proof** that the creator manually reviews. It works, but it's trust-based and slow.

### How it works

The challenge creator picks `verification_type = "nostr_action"` at creation time and pins a **target event id** (a 64-char hex note id). Participants prove completion by **liking that exact note on Nostr** from their normal client (Damus, Amethyst, nos2x, etc.).

### Verification path

1. Participant clicks "Verify my like on Nostr" on the challenge detail page.
2. The API queries the configured relays in parallel for:
   ```
   { kinds: [7], authors: [<participant_pubkey>], "#e": [<target_event_id>], limit: 1 }
   ```
3. The first matching event that passes signature verification is accepted as proof.
4. The completion is inserted with `status='approved'` and `proof_event_id=<like_event_id>`, and the participant's `progress` is incremented.

A partial unique index on `completions(challenge_id, user_id, proof_event_id) WHERE proof_event_id IS NOT NULL` prevents the same like from being submitted twice as proof for the same challenge — including the race between two concurrent "Verify my like" clicks.

### Files

- `lib/nostr/fetch-events.ts` — generic server-side relay `REQ` helper
- `lib/nostr/verify-like.ts` — NIP-25 kind 7 wrapper
- `app/api/challenges/[id]/completions/route.ts` — branches on `verification_type`

## 2. Checkpoints

### What it does

A challenge can be split into ordered or unordered sub-tasks. The creator picks a `checkpoint_mode` per challenge:

- **`none`** — the default. Single flat completion flow, unchanged.
- **`sequential`** — each earlier checkpoint must be approved before the next can be completed. Good for streaks and multi-step quests.
- **`parallel`** — checkpoints can be completed in any order. Good for "do these three things" bundles.

Each checkpoint has its own `verification_type`, so you can mix: one checkpoint uses a creator_approval text proof, the next uses nostr_action kind 7, the third is automatic.

### Data model

```
challenges
  checkpoint_mode: 'none' | 'sequential' | 'parallel'

challenge_checkpoints
  (challenge_id, order) UNIQUE
  title, description
  verification_type, nostr_action_target_event_id

checkpoint_completions
  (participant_id, checkpoint_id) UNIQUE
  status, proof_event_id, content, completed_at
```

Each approved checkpoint = 1 point. The participant's `progress` always equals the count of their approved checkpoints, and they auto-flip to `completed` when that count hits `challenge.goal` (which is set to the checkpoint count on create).

### Sequential guard

```ts
if (challenge.checkpoint_mode === "sequential" && checkpoint.order > 0) {
  const priors = await db.select().from(challenge_checkpoints).where(
    and(eq(..., challenge_id), lt(order, checkpoint.order))
  );
  const done = await db.select().from(checkpoint_completions).where(
    and(eq(participant_id, ...), eq(status, "approved"), inArray(checkpoint_id, priorIds))
  );
  if (done.length < priorIds.length) throw new BadRequestError(...);
}
```

### Atomic insert

Creating a challenge and its checkpoints in one request is atomic via `db.batch([insert(challenges), insert(challenge_checkpoints)])`. Neon's HTTP driver doesn't support `db.transaction()`, but `batch` runs as an implicit transaction, and a pre-generated UUID lets the checkpoint rows reference the parent without a round-trip.

### Files

- `app/api/challenges/route.ts` — POST accepts a `checkpoints` array
- `app/api/challenges/[id]/checkpoints/[checkpointId]/complete/route.ts` — per-checkpoint completion endpoint
- `components/common/Block` — reused to visualise progress (green/red/purple) on the detail page

## 3. Zap rewards (NIP-57 + NIP-75)

### Funding: NIP-75 Zap Goals

When a creator sets `prize_amount_sats > 0`, they can optionally toggle **"Publish Zap Goal on Nostr"**. On challenge create, the client:

1. Builds a kind 9041 event via `buildZapGoalEvent`:
   ```json
   {
     "kind": 9041,
     "content": "Prize pot: <challenge title>",
     "tags": [
       ["amount", "<millisats>"],
       ["relays", "wss://relay.damus.io", "..."],
       ["a", "30100:<creator_pubkey>:<slug>"],
       ["closed_at", "<unix>"]
     ]
   }
   ```
2. Signs it via `useSignerContext().signWithPrompt`.
3. Publishes it to `DEFAULT_RELAYS`.
4. PUTs the returned event id back to `/api/challenges/[id]` so the DB tracks the goal.

Supporters can then zap the goal event directly from any NIP-57 client to grow the pot.

### Payout: NIP-57 kind 9734

The creator picks `reward_zap_mode` per challenge:

| Mode | Winners | Split |
|---|---|---|
| `first_to_complete` | Single earliest completer | 100% to winner |
| `split` | All completers | Equal, rounding remainder to first place |
| `tiered` | Top 3 by completion time | 50% / 30% / 20% (renormalized if <3 completers) |

Clicking **"Pay winners"** on the detail page runs this client-side loop:

1. `POST /api/challenges/[id]/reward` — server computes the winner list from `reward_zap_mode`, loads each winner's `lud16` from the `users` row (falling back to a parallel kind:0 metadata fetch from relays), and returns:
   ```json
   {
     "winners": [
       { "user_id": "…", "nostr_pubkey": "…", "lightning_address": "…@getalby.com", "amount_sats": 1500 },
       ...
     ]
   }
   ```
2. For each winner, the client:
   - Builds a NIP-57 kind 9734 zap request via `buildZapRequestEvent`
   - Signs it with the active signer
   - Resolves the `lud16` to its LNURL-pay callback
   - Calls `fetchInvoice(callback, amount_sats, undefined, signedZapRequest)` — the signed zap request is attached as the `nostr` query parameter, so the recipient's node emits a proper kind 9735 receipt
   - Pays the returned BOLT11 via `window.webln.sendPayment`
3. After all payments, `PATCH /api/challenges/[id]/reward` flips `rewards_paid_at` to now.

No invoices cross our server. No sats sit on our server. No custody.

### Files

- `lib/nostr/events.ts` — `buildZapGoalEvent`, `buildZapRequestEvent`
- `lib/nostr/lnurl.ts` — `fetchInvoice` now accepts an optional signed zap request
- `app/api/challenges/[id]/reward/route.ts` — winner computation + receipt write-back
- Challenge detail page — creator-only "Pay winners" section with per-winner progress

## Combined example

Imagine a hackathon practice challenge:

- Creator publishes a challenge with `checkpoint_mode: "sequential"`, three checkpoints, and a 10000-sat prize pool with `reward_zap_mode: "first_to_complete"`.
- Checkpoint 1 uses `nostr_action` targeting a specific note id ("like this announcement").
- Checkpoint 2 is `creator_approval` with a text proof.
- Checkpoint 3 is another `nostr_action` targeting a different note.
- The creator also publishes a Zap Goal so the community can fund the pot before kickoff.

A participant:
1. Likes note #1 from Damus → clicks "Verify my like on Nostr" → checkpoint 1 turns green.
2. Writes a text proof for checkpoint 2 → creator reviews and approves → checkpoint 2 turns green.
3. Likes note #3 from Amethyst → verifies → checkpoint 3 turns green → their participant row flips to `completed`.

The creator clicks "Pay winners" → WebLN pops up one invoice → they pay → the challenge shows "Rewards already paid".

Every step is backed by signed Nostr events; the DB is just a cache for UI.
