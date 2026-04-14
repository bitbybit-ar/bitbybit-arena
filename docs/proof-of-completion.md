
# Proof of Completion

## The Problem

How does a user prove they actually completed a challenge? Different challenges need different proof mechanisms, but for MVP we keep it simple: text-only proofs.

## Proof Type (MVP)

### Text Description

User writes what they did. Simple, fast, works for any challenge type.

**Flow:**
1. User taps "Submit Proof" on the challenge
2. Text input opens (title + description)
3. Completion event (kind: 7101) published to Nostr with the text as content
4. Verification process begins based on challenge settings

**Use cases:**
- "Read a chapter of a book" → "Finished chapter 5 of The Bitcoin Standard"
- "Meditate for 10 minutes" → "Did a 15-minute session this morning"
- "Run a 5K" → "Ran 5.2km in 28 minutes at the park"
- "Best sunset photo" → "Caught an amazing sunset from the rooftop" (description only for MVP)

### Future: Photo/Video Proof (Post-MVP)

Photo uploads via Blossom (NIP-B7) are planned but deferred. They add complexity (upload flow, file size limits, Blossom server selection) without being essential for the core demo flow.

## Verification Methods

The challenge creator chooses the verification method when creating the challenge. BitByBit Arena stores verification state **inline in the database** (`completions.status`, `reviewed_by`, `reviewed_at`) rather than publishing verification events to relays. See the [Verification architecture](#verification-architecture-mvp) note below for the rationale and post-MVP plans.

### Creator Approval (Default)

- Completions go to the creator's verification queue in the app
- Creator reviews proof and POSTs to `/api/completions/[id]/verify` with `status: approved | rejected`
- The server updates `completions.status` and stamps `reviewed_by` / `reviewed_at`
- On approval, participant progress is bumped and `status=completed` is set when `progress >= goal`
- Simple, trusted, works well for small challenges

### Community Vote (post-MVP, not implemented)

Planned: completions would be visible to all participants, who vote to approve/reject, with a majority threshold within a time window. Not available in the current MVP — `community_vote` is rejected by the challenge validators. Tracked for a future release alongside the kind:7102 verification event (see below).

### Automatic (Honor System)

- Completion is auto-approved when submitted
- No verification queue
- Best for low-stakes, trust-based challenges
- Badge is awarded immediately

### Nostr Action (auto-verified via reaction)

- Creator adds `"nostr_action"` to `verification_methods` and pins a target event id at challenge creation
- Participant proves completion by publishing a NIP-25 kind 7 reaction (like) to that event from any Nostr client
- When they click "Verify my like on Nostr", the server queries `DEFAULT_RELAYS` in parallel for a signed kind 7 event from their pubkey e-tagging the target
- On match, the completion is inserted as `approved` with `proof_event_id = <like event id>` and the participant's progress bumps
- A partial unique index prevents the same like from being counted twice

### Nostr Hashtag (auto-verified via post)

- Creator adds `"nostr_hashtag"` to `verification_methods` and sets `nostr_hashtag` (lowercase alphanumeric/underscore, 2–50 chars)
- Participant publishes a kind:1 note tagged with that `#t` hashtag from any Nostr client
- When they submit the completion, the server queries relays for a signed kind:1 by their pubkey carrying the `t` tag — lowercase, uppercase, and capitalized variants are all queried and matched case-insensitively
- On match, the completion is inserted as `approved` with `proof_event_id = <note event id>` and the participant's progress bumps
- The same duplicate-proof index applies — reposting the same note twice won't stack progress

### Combining methods

`verification_methods` is an array. A challenge can enable several paths at once — e.g. a hackathon could accept `["nostr_hashtag", "creator_approval"]` so anyone with a nostr client auto-qualifies by posting with the tag, and anyone who can't still has a manual fallback. When multiple methods are enabled, the client must pass `method: <value>` in the completions POST body so the server knows which path to run.

See [docs/nostr-flows.md](./nostr-flows.md) for the full paths.

## Verification Flow

```
User submits proof
POST /api/challenges/[id]/completions
         |
         v
  +---------------+
  | Verification  |
  |   method?     |
  +---------------+
    |    |    |     |
    v    v    v     v
 Creator  Auto  Nostr  Nostr
 review   (honor) action hashtag
    |    |    |     |
    |    |    |     |
    v    v    v     v
 completions.status = approved | rejected
 completions.reviewed_by / reviewed_at set
         |
         v
 If approved: participant.progress++,
 status=completed when progress >= goal
         |
         v
 Badge awarded (kind: 8, client-side via NIP-58)
```

## Verification architecture (MVP)

Earlier drafts of this doc and `docs/nostr-events.md` modelled verification as a dedicated Nostr event (`kind:7102`) published to relays. The shipped MVP **does not publish verification events** — it stores the verification state in the `completions` row (`status`, `reviewed_by`, `reviewed_at`) and updates participant progress in the same transaction.

**Why inline state for MVP:**
- Avoids a second round-trip to relays on every review action, which would make the creator queue feel laggy
- Keeps the verification authoritative in a place we control — relays can drop events and reviews need to be deterministic
- Unblocks the creator queue, auto-verification paths (`nostr_action`, `nostr_hashtag`), and the reward flow without needing a custom kind to be finalized first

**Post-MVP extension:** once kind numbers are finalized, we plan to mirror each verification decision as a `kind:7102` event published by the reviewer. That makes the verification publicly auditable on relays and unlocks community-vote tallies. The DB row stays the source of truth; the relay event is a signed, shareable attestation of the same decision.

## Anti-Fraud Considerations

For MVP, we accept that text proofs rely on trust. The mitigations are social, not technical:

1. **Reputation** — Nostr identity is persistent. Cheating damages your public reputation
2. **Creator gatekeeping** — Creator approval catches obvious fakes
3. **Community flagging** — Other participants can call out suspicious submissions
4. **Public submissions** — All proofs are visible on Nostr, creating social accountability

For post-MVP, consider:
- Photo/video proof via Blossom (NIP-B7) with tamper-evident hashing
- ProofMode integration (cryptographic device attestation)
- NIP-03 OpenTimestamps for provable submission times
