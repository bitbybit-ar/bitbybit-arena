# Nostr Flows

This document describes the three Nostr-native flows added to BitByBit Arena on top of the base challenge platform:

1. **Nostr proof-of-completion** — auto-verify completions via NIP-25 kind 7 reactions or NIP-12 hashtag posts
2. **Checkpoints** — sequential or parallel sub-tasks, each independently verifiable
3. **Zap rewards** — NIP-75 Zap Goals for funding + NIP-57 client-side payouts to winners

All three are optional and compose cleanly: a challenge can have any combination of them (or none).

## 1. Nostr proof-of-completion

### What it replaces

The legacy flow accepts a **text proof** that the creator manually reviews. It works, but it's trust-based and slow.

### Verification methods

Each challenge (and each checkpoint) carries a `verification_methods: text[]` column — an ordered array of the methods participants can use to complete it. A challenge may enable **multiple methods at once** so participants can pick their path:

| Value | How it's verified | Approval |
|---|---|---|
| `creator_approval` | Participant submits text proof, creator reviews in-app | Manual |
| `automatic` | Honor system — any text proof auto-approves | Automatic |
| `nostr_action` | NIP-25 kind 7 reaction (like) to a target event id the creator pinned | Automatic (queries relays) |
| `nostr_hashtag` | NIP-12 kind:1 note by the participant tagged with a specific `#t` hashtag the creator set | Automatic (queries relays) |

When the challenge has more than one method, the client must pass `method: <value>` in the completions POST body. Single-method challenges default to their sole method.

### Example configurations

- **Like-to-enter raffle** → `["nostr_action"]` + `nostr_action_target_event_id`
- **Hashtag campaign** → `["nostr_hashtag"]` + `nostr_hashtag`
- **Hackathon (multi-method)** → `["nostr_hashtag", "creator_approval"]` + hashtag set. Participants who post on nostr with the tag get auto-verified; anyone who can't use their nostr client can still submit a link for manual review.
- **Text-proof only (legacy)** → `["creator_approval"]`

### Verification path — `nostr_action`

1. Participant clicks "Verify my like on Nostr" on the challenge detail page.
2. The API queries the configured relays in parallel for:
   ```
   { kinds: [7], authors: [<participant_pubkey>], "#e": [<target_event_id>], limit: 1 }
   ```
3. The first matching event that passes signature verification is accepted as proof.
4. The completion is inserted with `status='approved'` and `proof_event_id=<like_event_id>`, and the participant's `progress` is incremented.

### Verification path — `nostr_hashtag`

1. Participant publishes a kind:1 note from their normal client (Damus, Amethyst, nos2x, etc.) with the `#t` tag the challenge specifies — e.g. `["t", "arenahackathon"]`.
2. Participant opens the challenge and submits the completion.
3. The API queries:
   ```
   { kinds: [1], authors: [<participant_pubkey>], "#t": [<hashtag variants>], limit: 1 }
   ```
   Lowercase, uppercase, and capitalized variants are all tried since not every client normalizes tags.
4. The returned event's `t` tags are re-checked case-insensitively before it's accepted as proof.
5. The completion is auto-approved with `proof_event_id=<note_event_id>`.

### Duplicate protection

A partial unique index on `completions(challenge_id, user_id, proof_event_id) WHERE proof_event_id IS NOT NULL` prevents the same event from being submitted twice as proof for the same challenge — including the race between two concurrent verification clicks.

### Files

- `lib/nostr/fetch-events.ts` — generic server-side relay `REQ` helper
- `lib/nostr/verify-like.ts` — NIP-25 kind 7 wrapper
- `lib/nostr/verify-hashtag-post.ts` — NIP-12 `#t` wrapper with multi-case fallback
- `lib/api/verification-methods.ts` — `pickVerificationMethod(input, allowed)` helper shared by both completion routes
- `app/api/challenges/[id]/completions/route.ts` — branches on the picked method
- `app/api/challenges/[id]/checkpoints/[checkpointId]/complete/route.ts` — same branching per checkpoint

## 2. Checkpoints

### What it does

A challenge can be split into ordered or unordered sub-tasks. The creator picks a `checkpoint_mode` per challenge:

- **`none`** — the default. Single flat completion flow, unchanged.
- **`sequential`** — each earlier checkpoint must be approved before the next can be completed. Good for streaks and multi-step quests.
- **`parallel`** — checkpoints can be completed in any order. Good for "do these three things" bundles.

Each checkpoint has its own `verification_methods` array, so you can mix: one checkpoint uses a creator_approval text proof, the next uses nostr_action kind 7, the third is automatic, and a fourth asks for a nostr_hashtag post.

### Data model

```
challenges
  checkpoint_mode: 'none' | 'sequential' | 'parallel'

challenge_checkpoints
  (challenge_id, order) UNIQUE
  title, description
  verification_methods: text[]
  nostr_action_target_event_id
  nostr_hashtag

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

When a creator sets `prize_amount_sats > 0`, the client **automatically** publishes a kind 9041 Zap Goal (no opt-in toggle — without it, supporters have nothing to zap). On challenge create, `CreateChallengeForm`:

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
4. `PUT`s the returned event id back to `/api/challenges/[id]` so the DB tracks the goal.

If step 2 or 3 fails (signer rejected, relay outage), the challenge is still created but `zap_goal_event_id` stays null. The creator sees a **"Republish zap goal"** button on the challenge detail page that re-runs steps 1–4 via `handleRepublishZapGoal` in `challenge-client.tsx`.

#### Supporter funding loop

Any logged-in user on the challenge detail page can click **"Fund this pot"** (or "Be the first to fund it" when the pot is empty). The `FundPotModal` runs the same state machine as a zap on a completion:

1. Builds a kind:9734 zap request that `e`-tags `zap_goal_event_id` and `p`-tags the creator.
2. Signs it with the active signer.
3. Resolves the creator's `lud16` to its LNURL-pay callback.
4. Fetches a BOLT11 invoice with the signed zap request attached as the `nostr` query param.
5. Pays via `window.webln.sendPayment` if available, or renders a QR + polls `/api/zap/status` (NWC-backed) until settled.

The LNURL provider emits a kind:9735 receipt that `e`-tags the goal event id. Arena aggregates receipts two ways:

- **Server**: `GET /api/challenges/[id]/zap-goal-progress` fetches all kind:9735 with `#e = zap_goal_event_id` from `DEFAULT_RELAYS`, sums amounts parsed out of the embedded requests' `description` tags, and caches the rollup for 45s. Used by Explore cards (`ZapGoalBar`) to render a compact progress bar per card.
- **Client live**: `useZapGoalProgress` opens a long-lived `REQ` per relay on the detail page. New receipts dedupe by receipt id and tick the `ZapGoalProgress` panel (raised/goal sats, zapper count, 8 most recent zappers with avatars + messages) in real time without a reload.

### Payout: NIP-57 kind 9734

The creator picks `prize_distribution` per challenge (source of truth is the column of the same name on `challenges`):

| Value | Winners | Split |
|---|---|---|
| `first_to_complete` | Single earliest completer | 100% to winner |
| `split` | All completers | Equal, rounding remainder to first place |
| `tiered` | Top 3 by completion time | 50% / 30% / 20% (renormalized if <3 completers) |
| `none` | — | Badge-only challenge; payout route rejects with 400 |

Clicking **"Distribute rewards"** on the detail page runs this client-side loop:

1. `POST /api/challenges/[id]/reward` — server computes the winner list from `prize_distribution`, loads each winner's `lud16` from the `users` row (falling back to a parallel kind:0 metadata fetch from relays), and returns:
   ```json
   {
     "winners": [
       { "user_id": "…", "nostr_pubkey": "…", "lightning_address": "…@getalby.com", "amount_sats": 1500, "retained": false },
       ...
     ]
   }
   ```
2. For each non-retained winner, the client:
   - Builds a NIP-57 kind 9734 zap request via `buildZapRequestEvent`.
   - Signs it with the active signer.
   - Resolves the `lud16` to its LNURL-pay callback.
   - Calls `fetchInvoice(callback, amount_sats, undefined, signedZapRequest)` — the signed zap request is attached as the `nostr` query parameter, so the recipient's node emits a proper kind 9735 receipt.
   - Pays via `window.webln.sendPayment`, falling back to QR + `/api/zap/status` polling when WebLN isn't present.
3. After the last winner, `PATCH /api/challenges/[id]/reward` with `{all_winners_paid: true}` stamps `rewards_paid_at`. The server **only** flips the timestamp when the flag is explicitly set — an empty body is a 400. See "Known limits" below for the residual risk around mid-loop interruptions.
4. The client publishes kind:30101 Challenge Result summarising winners + stats.

No invoices cross our server. No sats sit on our server. No custody.

#### Known limits

- **Mid-loop interruption can replay payments.** If the creator pays 2 of 3 winners and the tab closes before step 3, `rewards_paid_at` stays null and a retry will re-offer every winner — including the two already paid. Closing this gap cleanly needs per-winner `reward_zap_receipt_id` bookkeeping on the participants row; tracked as follow-up.
- **Receipt write-back is best-effort.** Most WebLN wallets don't return the on-relay kind:9735 id to the browser, so `completions.reward_zap_receipt_id` is typically null after a successful payout. The kind:30101 result event is the public record of who won.

### Files

- `lib/nostr/events.ts` — `buildZapGoalEvent`, `buildZapRequestEvent`, `buildChallengeResultEvent`.
- `lib/nostr/fetch-zap-receipts.ts` — isomorphic kind:9735 fetch + embedded-9734 parser used by both the server cache and the client hook.
- `lib/hooks/useZapGoalProgress.ts` — client-side live subscription + dedupe.
- `lib/nostr/lnurl.ts` — `fetchInvoice` accepts an optional signed zap request.
- `app/api/challenges/[id]/reward/route.ts` — winner computation + receipt write-back, `all_winners_paid` flag semantics.
- `app/api/challenges/[id]/zap-goal-progress/route.ts` — cached server snapshot for Explore cards.
- `components/challenges/FundPotModal/` — supporter funding flow.
- `components/challenges/ZapGoalProgress/` — detail-page panel with live progress.
- `components/challenges/ZapGoalBar/` — compact Explore-card variant.
- Challenge detail page — creator-only "Distribute rewards" section with per-winner progress.

## Combined example

Imagine a hackathon practice challenge:

- Creator publishes a challenge with `checkpoint_mode: "sequential"`, three checkpoints, and a 10000-sat prize pool with `prize_distribution: "first_to_complete"`.
- Checkpoint 1 uses `verification_methods: ["nostr_action"]` targeting a specific note id ("like this announcement").
- Checkpoint 2 is `verification_methods: ["creator_approval"]` with a text proof.
- Checkpoint 3 uses `verification_methods: ["nostr_hashtag"]` with `nostr_hashtag: "arenahack"` — participants publish a kind:1 note tagged `#arenahack` to pass.
- A Zap Goal is auto-published alongside the challenge so the community can top up the pot before kickoff.

A supporter:
1. Opens the challenge, clicks **Fund this pot**, chooses 1000 sats + a message.
2. WebLN pops an invoice → pays → within seconds the progress bar ticks up and their avatar appears in the recent-zappers list.

A participant:
1. Likes note #1 from Damus → clicks "Verify my like on Nostr" → checkpoint 1 turns green.
2. Writes a text proof for checkpoint 2 → creator reviews and approves → checkpoint 2 turns green.
3. Likes note #3 from Amethyst → verifies → checkpoint 3 turns green → their participant row flips to `completed`.

The creator clicks **Distribute rewards** → WebLN pops up one invoice for the winner → they pay → the detail page shows the panel's "Prize distributed" badge and the kind:30101 Challenge Result lands on relays.

Every step is backed by signed Nostr events; the DB is just a cache for UI.
