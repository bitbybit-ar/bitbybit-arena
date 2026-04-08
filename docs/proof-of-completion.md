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

The challenge creator chooses the verification method when creating the challenge:

### Creator Approval (Default)

- Completions go to creator's verification queue
- Creator reviews proof and approves/rejects (kind: 7102)
- Simple, trusted, works well for small challenges

### Community Vote

- Completions are visible to all participants
- Participants vote to approve/reject (kind: 7102 from multiple users)
- Threshold: majority of votes within a time window
- Better for large challenges where the creator can't review everything

### Automatic (Honor System)

- Completion is auto-approved when submitted
- No verification queue
- Best for low-stakes, trust-based challenges
- Badge is awarded immediately

## Verification Flow

```
User submits text proof (kind: 7101)
         |
         v
    +-----------+
    | Verification |
    |   method?    |
    +-----------+
    |     |      |
    v     v      v
 Creator  Community  Auto
 reviews  votes      approved
    |     |          |
    v     v          v
 kind:7102         Badge awarded (kind: 8)
 approved?
    |
    v
 Badge awarded (kind: 8)
```

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
