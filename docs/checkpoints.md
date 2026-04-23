# Checkpoints (multi-step challenges)

## The problem

Not every challenge fits in a single proof. "Read a book" is one step, but "Complete a 5-day drawing challenge" is five. The old model forced users to encode multi-step work into a single completion, so:

- Creators couldn't enforce an order ("finish day 1 before you upload day 2").
- Participants couldn't see which steps were approved vs. still pending.
- The creator had no per-step review surface — they saw one big text blob.

Checkpoints split a challenge into 1-20 sub-tasks, each with its own verification method and its own approval state.

## Data model

Two tables on top of the existing `challenges` and `participants`:

```
challenges
  └── challenge_checkpoints        (one row per step, ordered)
        └── checkpoint_completions (one row per participant, per step — upserts on retry)
```

- `challenges.checkpoint_mode`: `"none" | "sequential" | "parallel"`. When the mode is set, `goal` is auto-calculated as the checkpoint count and `unit` is forced to `"checkpoints"`.
- `challenge_checkpoints`: `(challenge_id, order)` is unique; `ON DELETE CASCADE` from the challenge.
- `checkpoint_completions`: `(participant_id, checkpoint_id)` is unique. The row upserts on retry after rejection — see [State machine](#state-machine) below.

See `lib/db/schema.ts:166-220` for the full Drizzle definition.

## Verification method matrix

Each checkpoint picks its own verification method (independent of the parent challenge's methods):

| Method            | What the participant does                                           | Who approves      | Auto-approve? |
| ----------------- | ------------------------------------------------------------------- | ----------------- | ------------- |
| `creator_approval`| Writes a text description and/or uploads a Blossom photo            | The creator       | No — sits in `pending` until the creator verifies |
| `automatic`       | Submits anything; the row is marked approved immediately            | Nobody            | Yes           |
| `nostr_action`    | Likes the target event (kind 7) on Nostr                            | The relays        | Yes — `verifyLikeForTarget` confirms the reaction exists |
| `nostr_hashtag`   | Publishes any note with the configured hashtag                      | The relays        | Yes — `verifyHashtagPost` confirms a matching event exists |

Auto-approved methods skip the pending state entirely and bump the participant's progress immediately.

## State machine

```
              submit
              ───────▶  pending  ─── approve ───▶  approved  (terminal)
                          │
                          └── reject ──▶  rejected ─── resubmit ───▶ pending
                                                       (upserts the existing
                                                        row; unique index
                                                        prevents a second row)
```

Observed by the UI as five rendered states on the participant side: `done`, `awaiting-review`, `rejected`, `locked`, `todo` (see `components/challenges/CheckpointItem/index.tsx`).

- **Approved is terminal.** A second submit for an approved checkpoint returns `400 "This checkpoint is already completed"`.
- **Pending is also terminal-during-review.** A second submit while another one is still pending returns `400 "You already submitted this checkpoint — waiting for review"` — this avoids spamming the creator.
- **Rejected is the only retry-able state.** The handler updates the existing row (new content, new image, status flips back to `pending` or `approved`) so sequential mode unlocks downstream checkpoints as soon as the retry gets re-approved.

## Sequential vs. parallel

- **`parallel`** (default for checkpointed challenges): participants can submit checkpoints in any order. The view renders a list; each item is independently gated on its own state.
- **`sequential`**: a checkpoint is **locked** while any lower-`order` checkpoint isn't approved. The server enforces this (`app/api/challenges/[id]/checkpoints/[checkpointId]/complete/route.ts` — sequential guard returns `400 "Complete the previous checkpoint before this one"`). The UI hides the submit form and shows a red Block + lock hint.

Participants on a sequential challenge with a rejected step 2 cannot submit step 3 until step 2 is re-approved. Once the creator approves the retry of step 2, step 3 automatically unlocks on the next render.

## Progress accounting

`participants.progress` mirrors the count of approved `checkpoint_completions`. Both the auto-approve path (in `.../complete/route.ts`) and the manual approve path (in `app/api/checkpoint-completions/[id]/verify/route.ts`) call the shared `recomputeCheckpointProgress` helper in `lib/db/checkpoints.ts`, which counts approved rows and sets `participants.status = "completed"` (+ `completed_at`) when the count equals the total. Using a count — not an increment — is deliberate so concurrent approvals can't double-bump.

## API surfaces

- **`POST /api/challenges` / `PUT /api/challenges/[id]`** — create / update. Body accepts `checkpoint_mode` and a `checkpoints[]` array validated by `CheckpointInputSchema` (1-20 items, per-method field requirements).
- **`GET /api/challenges/[id]`** — returns the `checkpoints` array, the caller's own `my_checkpoint_completions`, and for the creator only, `pending_checkpoint_submissions` (joined with the participant user row).
- **`POST /api/challenges/[id]/checkpoints/[checkpointId]/complete`** — participant submits a proof. Validates `content` (≥ 5 chars when non-empty) and `image_url` (HTTP(S) URL); requires one of them for manual methods. Upserts on retry.
- **`POST /api/checkpoint-completions/[id]/verify`** — creator approves or rejects a pending row. Authz-first (non-creator → 403 regardless of row status), then the status guard (already-reviewed → 400). On approve, recomputes progress and pings the participant via `createNotification`.
- **`GET /api/my-challenges`** — returns per-participant `checkpoints_total / _approved / _pending` counts for every joined challenge, computed via pre-aggregated CTEs (see `app/api/my-challenges/route.ts`). Cursor-paginated; the `my-challenges` list card renders the `CheckpointProgress` dot indicator from these counts.

## Notifications

Emitted via `createNotification`; per-type opt-out is on `users.notification_prefs`:

- `checkpoint_submitted` — pings the creator when a pending submission lands.
- `checkpoint_verified` — pings the participant on approval or rejection; the metadata `status` field flips the notification-bell copy between the `_approved` and `_rejected` variants.

Both types have settings-page toggles and live fallback strings in `messages/es.json` + `messages/en.json`.

## Known limitations

- **No reject reason field.** The participant sees "your proof was rejected" but no explanation. A `reject_reason text` column on `checkpoint_completions` + a textarea on the creator review card is the shortest fix.
- **No checkpoint reordering after create.** The `(challenge_id, order)` unique index makes a reorder UI painful; once participants have submitted, we'd also need to renumber their checkpoint_completions.
- **No per-checkpoint badges.** NIP-58 kind:8 badges award on challenge completion, not per step. Tier-3 polish.
- **No pagination on `pending_checkpoint_submissions`.** Fine at hackathon scale; revisit if a creator's review queue grows past ~50 rows.
- **No NIP-95 completion event for checkpoint submissions.** Regular completions emit a kind 7101 event via `buildCompletionEvent`; checkpoint submissions don't publish anything to Nostr (the API insert is the only source of truth).

## Files

| Concern                     | Location                                                                 |
| --------------------------- | ------------------------------------------------------------------------ |
| Schema                      | `lib/db/schema.ts` (tables `challenge_checkpoints`, `checkpoint_completions`) |
| Types                       | `lib/types.ts` — `Checkpoint`, `CheckpointCompletion`, `PendingCheckpointSubmission` |
| Request schemas             | `lib/schemas/challenges.ts` (create/update) + `lib/schemas/completions.ts` (submit/verify) |
| Submission handler          | `app/api/challenges/[id]/checkpoints/[checkpointId]/complete/route.ts`   |
| Creator review handler      | `app/api/checkpoint-completions/[id]/verify/route.ts`                    |
| Progress helper             | `lib/db/checkpoints.ts` — `recomputeCheckpointProgress`                   |
| UI components               | `components/challenges/CheckpointItem`, `CheckpointProgress`, `CheckpointSubmitForm` |
| Detail page wiring          | `app/[locale]/(app)/explore/[id]/challenge-client.tsx`                   |
| my-challenges list          | `app/[locale]/(app)/my-challenges/page.tsx` + `/api/my-challenges`        |
