# Judge walkthrough

This is the hands-on guide for evaluating BitByBit Arena. Eleven numbered steps, in order; each one is self-contained, names a visible button label, and — where relevant — tells you which Nostr event kind the app emits, so you can cross-check it on a relay explorer.

> **Setup is in [`SUBMISSION.md`](../SUBMISSION.md).** Install, env vars, the optional seeder, and the project's evaluation framing live there. This document picks up after the app is running and you're signed in. Locale, signer, and Lightning fallback notes are duplicated only when a specific step depends on them.

---

## Step 1 — Sign in

1. Go to `/signin` (or click **Sign in** from the navbar on `/`).
2. Pick one of the three tabs: **Extension**, **Bunker**, **Paste nsec**.
3. Sign the login event. Under the hood we build an unsigned **NIP-98 HTTP Auth** event (kind 27235) bound to `POST /api/auth/nostr`, the signer signs it, and it travels in `Authorization: Nostr <base64(event)>`. No challenge cookie, no password.
4. You're redirected to `/explore` and a `__Host-session` cookie is set (plain `session` in dev).

On first login the app creates a `users` row keyed by your Nostr pubkey and kicks off an async fetch for your kind:0 profile metadata.

## Step 2 — Edit your profile

1. Open **Settings** from the navbar.
2. Click **Sync from relays** — the app fetches your kind:0 metadata from `relay.damus.io`, `relay.nostr.band`, `nos.lol`, `relay.primal.net` and pre-fills the form.
3. Change a field (e.g. About) and click **Publish to Nostr** — a fresh signed kind:0 event ships to relays, preserving any fields Arena doesn't manage (`nip05`, `website`, `banner`, …).
4. Toggle theme (light / dark) and language (ES / EN). Both persist.
5. Scroll to **Notifications** — flip any of the five per-type toggles (someone joins, new proof, verdict, prize, badge). Each toggle auto-saves as a partial `PATCH /api/profile` with only that key, so a second tab's pending change can't clobber this one. Disabled types are silently skipped in `createNotification` — no bell entry, no DB write.

## Step 3 — Create a challenge

1. From Explore click **Create challenge** → lands on `/create`.
2. Fill title, description, start/end dates, and pick a **type**. The five types are: `one_time`, `streak`, `competition`, `race`, `creative`.
3. Pick one or more **verification methods**:
   - `creator_approval` — you review each submission manually.
   - `automatic` — honour system, auto-approves on submit.
   - `nostr_action` — participants prove by publishing a kind:7 reaction (like) to a note id you pin. Server auto-approves when it sees the like on relays.
   - `nostr_hashtag` — participants prove by posting a kind:1 note with a `#t` hashtag you specify.
4. Optional: set a prize (sats), a distribution rule (`first_to_complete` / `split` / `tiered` / `none`), a custom badge image (uploaded via Blossom), tags.
5. Submit. The server writes the `challenges` row; the client signs and publishes a **kind:30100** challenge definition event. If you enabled a zap goal and a prize, a **kind:9041** NIP-75 event is published too.

## Step 4 — Checkpointed challenge

Repeat step 3 but toggle checkpoints on. Add 2–3 checkpoints, each with its own verification method. Full design + state machine in [checkpoints.md](checkpoints.md).

- **Sequential mode** — checkpoint N+1 is locked until N is approved. Try to complete #3 before #2 — the server should 400.
- **Parallel mode** — any order.

Completing every checkpoint flips the participant's status to `completed` even if the challenge has no `goal` / `unit`.

### Creator-approval flow (end-to-end)

Use two accounts: the **creator** and the **participant**.

1. As the creator, make a **2-step challenge** with `checkpoint_mode: "sequential"` and `verification_methods: ["creator_approval"]` on both checkpoints.
2. Log out and log back in as the participant. Join the challenge.
3. Submit step 1 — type a 5-char description **or** attach a photo (or both). The card should flip to an **"In review"** gold badge and hide the submit form. The creator gets a `checkpoint_submitted` notification.
4. Try to submit step 2. The server returns 400 ("complete the previous checkpoint before this one") and the card shows the locked red hint.
5. Switch back to the creator. The challenge detail page now shows a **"Checkpoint proofs to review"** section above the participant's checkpoint list. Click **Approve**.
   - Participant progress bumps to `1/2`. The participant's `my-challenges` card updates on next poll.
   - Step 1 flips to the **Completed** green badge; step 2 unlocks.
   - Participant gets a `checkpoint_verified` notification, metadata `status=approved`.
6. As the participant, submit step 2. Approve it as the creator. The participant's `participants.status` flips to `completed` and `completed_at` is set — verify with either the badge-award UI or a quick DB check.

### Rejection retry

Starting from a clean state (new test challenge + account):

1. Participant submits step 1 with a deliberately weak proof.
2. Creator clicks **Reject**.
3. Participant reloads — the card shows the **Rejected** red badge and the "edit your response and submit again" hint. The submit form is back, pre-filled for retry.
4. Submit a better proof. Confirm exactly **one** row exists in `checkpoint_completions` for this (participant, checkpoint) — the retry updates the existing row, it doesn't insert a second one (unique index would block it anyway).
5. Creator approves. Progress advances normally.

### my-challenges progress indicator

With the participant account from above:

1. Open `/my-challenges` (Joined tab). The card for the checkpointed challenge shows a dot-per-step indicator (green/gold/muted) plus `"X/Y checkpoints"` text. If a submission is pending, a `" · N in review"` suffix appears.
2. With more than 20 joined challenges across the account, confirm **Load more** paginates correctly via the per-tab cursor.

## Step 5 — Explore

1. Return to Explore. Search, filter by type, click a popular tag chip.
2. Open the **Sort** dropdown. You should see five options: **Newest**, **Trending**, **Ending soon**, **Most participants**, **Most active**.
   - *Trending* is `joins + 2 × completions` over the last 7 days. Completions weigh double because actually doing the thing is a stronger signal than joining.
3. If you follow other Nostr users (kind:3), their challenges float to the top automatically. Toggle **Only following** to filter to just them.

## Step 6 — Join a challenge

1. Open any challenge detail page.
2. Click **Join**. The server inserts a `participants` row; the client publishes a **kind:7100** challenge-join event with an `a`-tag referencing the challenge's 30100 event.
3. Verify you can **Leave** and re-join without data loss.

## Step 7 — Submit a proof

Two paths, depending on the challenge's verification method:

**Text / image path** (for `creator_approval` or `automatic`):
1. On the challenge detail page, click **Submit proof**.
2. Type a description; optionally attach an image. Images upload via Blossom (content-addressed, BUD-01/02) — the client hashes the file, signs a short-lived kind:24242 auth event, and `PUT`s to `NEXT_PUBLIC_BLOSSOM_SERVER` (defaults to `https://blossom.primal.net`).
3. Submit. The client publishes a **kind:7101** completion event with a NIP-92 `imeta` tag carrying the sha256 if an image was attached.

**Nostr-action path** (for `nostr_action`):
1. Don't submit in the app. Open your preferred Nostr client (Damus, Primal, iris, …) and **like the target note** the creator pinned.
2. Come back to Arena and click **Verify my like on Nostr**.
3. The server fetches kind:7 reactions from your pubkey pointing at the target event id, verifies the signature, and auto-approves the completion. No creator review needed.

**Hashtag path** (for `nostr_hashtag`):
1. Publish a kind:1 note from any Nostr client with the challenge's `#t` hashtag.
2. Submit in the app; the server finds the note on relays and auto-approves.

## Step 8 — Creator approval + badges

As the challenge creator:

1. Go to **My Challenges → Created**, open the challenge.
2. Approve or reject pending completions. Approval bumps `participants.progress`; if progress hits the goal, status flips to `completed`.
3. Click **Award badges**, pick the winners. The client publishes:
   - **kind:30009** (NIP-58 badge definition), lazy-published on first award if it wasn't emitted at challenge creation.
   - One **kind:8** (badge award) per recipient, `a`-tagging the 30009 event.
4. The server records the `kind:8` event ids on the `badges` rows via `PATCH /api/challenges/[id]/award`.

As a recipient:

1. Go to **My Challenges → Achievements**. You'll see the new badge.
2. Click **Accept on Nostr**. The client builds a **kind:30008** profile-badges event that merges the new `(a, e)` tag pair with whatever was already on your profile, so older badges from other apps aren't clobbered.

## Step 9 — Lightning: funding and rewards

This step has two parts — a supporter funding the pot (any logged-in user) and the creator paying out winners. Either build a prized challenge yourself in Step 3, or — if you ran the optional seeder from `SUBMISSION.md` — open the pre-seeded **Demo: Tiered Prize Payout** challenge, which already has three pre-completed participants so you can jump straight to **Distribute rewards**.

> Heads-up: the QR-fallback modal polls `/api/zap/status` via Nostr Wallet Connect. If you don't have a WebLN extension and want the modal to auto-advance after payment, set `NWC_CONNECTION_URL` in `.env.local`. Otherwise pay the invoice in any wallet and refresh.

### Fund the pot (any logged-in user)

1. Open any challenge with a prize.
2. Click **Fund this pot** (or "Be the first to fund it" on an empty pot). The `FundPotModal` opens with preset amount chips, a custom-sats input, and an optional message.
3. Pick an amount, optionally type a message, click **Fund**. The client signs a **kind:9734** NIP-57 zap request that `e`-tags the `kind:9041` zap goal event id and `p`-tags the creator, resolves the creator's `lud16`, and fetches a BOLT11 invoice with the signed zap request attached. WebLN pays silently; the QR fallback kicks in otherwise.
4. Within a few seconds the `ZapGoalProgress` panel ticks up live (relay subscription to kind:9735 with `#e=<goal event id>`). Your avatar and message appear in the "Recent zappers" list without a page reload.

### Distribute rewards (creator only)

1. Once there's ≥1 completed participant, click **Distribute rewards**.
2. The server (`POST /api/challenges/[id]/reward`) computes the winners list per the challenge's `prize_distribution` rule:
   - `first_to_complete` — earliest completer gets 100%.
   - `split` — equal split; remainder to the first completer.
   - `tiered` — top 3 get 50 / 30 / 20 %, renormalised if fewer than 3.
   - If the creator themselves would win a share, it's marked `retained` and not paid out (the creator keeps their own sats).
3. For each payable winner the client builds a **kind:9734** NIP-57 zap request, signs it, resolves the recipient's `lud16`, fetches a BOLT11 invoice via LNURL-pay, and pays it via WebLN or the QR + NWC-polling fallback.
4. After the last winner, the client `PATCH`es `/api/challenges/[id]/reward` with `{all_winners_paid: true}` — the server **only** stamps `rewards_paid_at` when that flag is present, so the challenge can never flip into the "paid" state without the creator explicitly completing the loop.
5. The client publishes a **kind:30101** Challenge Result event with winner / completer / stats tags.

Verify the kind:30101 event on a relay explorer (e.g. `https://njump.me/<event-id>`) — it's the public record of who won. Verify the kind:9735 receipts for funding zaps in the same way to see the pot's full funding history on Nostr.

## Step 10 — My Challenges

1. Visit `/my-challenges`. Three tabs: **Joined**, **Created**, **Achievements**.
2. Create a second account (another browser, a different nsec), join the same challenge, confirm rows land in that account's **Joined** tab and not the first account's.
3. Accept a badge from the **Achievements** tab — verify the kind:30008 event merges cleanly.

## Step 11 — Notification bell

1. From any page, watch the **bell** icon in the navbar. The client polls `GET /api/notifications` every 30s and shows an unread count badge (caps at `9+`).
2. Trigger any of the five emission paths from a second account against yours: join, submit pending proof, approve/reject proof, award badge, record reward receipt. Each writes one row keyed by `type` and stores an English fallback plus a `metadata` object (challenge_id, display_name, etc.).
3. Open the bell. Titles and bodies render from i18n keys (`notifications.types.<key>.title|body`) scoped to your current locale — the English strings in the DB row are the fallback if a key is missing. `completion_verified` picks between `..._approved` and `..._rejected` from `metadata.status`.
4. Click a row — the client `PATCH`es `/api/notifications` to flip `read`, closes the dropdown, then routes to `/explore/<challenge_id>` via the i18n `Link` (navigation keeps the locale prefix).
5. Click **Mark all as read** — `POST /api/notifications` flips every unread row for the caller in one query. Ownership is enforced server-side: you can't mark or read another user's notifications (the `WHERE` clause pairs `user_id = session.user_id` with the row id).

Self-triggered events are skipped: the creator joining their own challenge doesn't ping themselves, and a retained creator prize doesn't fire `prize_awarded`. Auto-approved proofs (`nostr_action` / `nostr_hashtag` / `automatic`) skip the creator ping too — there's nothing to review.

## Language pass

Quick final check: switch between Spanish and English and glance at:

- Landing (`/`), Sign-in, Explore (with a filter active), Create, one Challenge detail page, My Challenges, Settings.
- Number / date formatting on challenge cards — Spanish uses comma for decimals and dot for thousands, English the opposite.

## What you've covered

By the end of the eleven steps you'll have exercised: all three sign-in methods, profile sync + publish, per-type notification preferences, all five challenge types, all four verification methods, sequential and parallel checkpoints, text and image proofs, Blossom uploads, creator approval, NIP-58 badge award + accept, NIP-57 Lightning payout (with QR fallback), NIP-75 zap goal publishing, NIP-02 follow-boosted discovery, `/api/zap/status` NWC polling, and the in-app notifications bell with mark-read / mark-all-read / click-through.
