# Proof of Completion

## The Problem

How does a user prove they actually completed a challenge? This is the hardest design problem in the app. Different challenges need different proof mechanisms.

## Proof Types

### 1. Photo/Video Proof (Primary method for MVP)

User uploads a photo or short video as evidence.

**Flow:**
1. User taps "Submit Proof" on the challenge
2. Camera opens (or file picker)
3. Photo uploaded to Blossom server (NIP-B7)
4. Blossom returns URL + SHA-256 hash
5. Completion event (kind: 7101) published with `proof` and `imeta` tags
6. Hash in the event ensures the photo can't be swapped later

**Strengths:**
- Simple, intuitive UX
- Works for most challenge types (fitness, creative, learning, etc.)
- Tamper-evident via Blossom hash

**Weaknesses:**
- Photos can be faked (screenshots, old photos, AI generated)
- Not suitable for all challenge types

**Mitigation:**
- Timestamp metadata in the photo (EXIF if available)
- Community can flag suspicious submissions
- Creator can reject during verification
- Future: integrate ProofMode for cryptographic device attestation

### 2. Text Description

User writes what they did. Simplest proof, relies on honor system.

**Use case:** Challenges where photo proof doesn't make sense (e.g., "Read a chapter of a book", "Meditate for 10 minutes").

### 3. Link/URL Proof

User submits a link as evidence (e.g., a Strava activity, a published blog post, a GitHub commit).

**Use case:** Challenges tied to online activity.

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
User submits proof (kind: 7101)
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
 approved?         Prize distributed (zap)
    |
    v
 Badge awarded (kind: 8)
 Prize distributed (zap)
```

## Anti-Fraud Considerations

For MVP, we accept that proof can be faked. The mitigations are social, not technical:

1. **Reputation** — Nostr identity is persistent. Cheating damages your public reputation
2. **Creator gatekeeping** — Creator approval catches obvious fakes
3. **Community flagging** — Other participants can call out suspicious submissions
4. **Prize structure** — Small prizes reduce incentive to cheat
5. **Public submissions** — All proofs are visible on Nostr, creating social accountability

For post-MVP, consider:
- ProofMode integration (cryptographic device attestation)
- NIP-03 OpenTimestamps for provable submission times
- AI-assisted photo verification (detect screenshots, duplicates)
- Staking mechanism (participants stake sats, lose them if caught cheating)

## Blossom Integration

### Upload Flow
1. Client generates NIP-98 auth token (signed by user's Nostr key)
2. Client uploads file to Blossom server via PUT
3. Blossom stores file, returns URL like `https://blossom.server/<sha256>.jpg`
4. Client includes URL and hash in completion event

### Server Selection
- Use user's configured Blossom servers (kind: 10063 server list)
- Fallback to default servers (e.g., blossom.band, cdn.satellite.earth)
- Store server list in user preferences

### File Size Limits
- Photos: max 5MB (reasonable quality, fast upload)
- Videos: max 20MB (short clips only for MVP)
- Supported formats: JPEG, PNG, WebP, MP4
