# Nostr Login Methods

## Overview

Users have three ways to log in, covering different use cases and devices. The login modal presents all three as tabs or options, ordered by security.

## Methods

### 1. Browser Extension (Recommended)

**How it works:** NIP-07 challenge-response. The extension (Alby, nos2x, Nostr Connect, etc.) holds the private key and signs events on behalf of the user. The app never sees the nsec.

**Flow:**
1. App calls `window.nostr.getPublicKey()`
2. Server issues a random challenge (stored in httpOnly cookie, 5 min expiry)
3. App asks extension to sign a kind:22242 event with the challenge as content
4. Server verifies signature → session created

**UX:**
- Big purple button: "Sign in with Extension"
- If no extension detected: show message "No extension detected" with links to install Alby / nos2x / Nostr Connect
- Re-detect on interval (extension may load late)

**Security:** Best. Private key never leaves the extension.

**Already implemented** — this is what we have today.

---

### 2. QR Code / Nostr Connect (NIP-46)

**How it works:** Remote signing via NIP-46 (Nostr Connect / Bunker). The user scans a QR code from a mobile Nostr app (Amber on Android, Damus on iOS, nsec.app) that acts as a remote signer. The app sends signing requests via Nostr relays, the mobile app approves them.

**Flow:**
1. App generates a NIP-46 connection request with a random session key
2. App displays QR code encoding `nostrconnect://` URI
3. User scans QR with their Nostr app (Amber, etc.)
4. Mobile app connects via relay and approves the signing request
5. App receives the signed event → server verifies → session created

**QR URI format:**
```
nostrconnect://<app-pubkey>?relay=wss://relay.example.com&metadata={"name":"BitByBit Challenges"}
```

**UX:**
- Tab label: "Scan QR"
- Show QR code prominently with "Scan with your Nostr app" instruction
- List compatible apps: Amber (Android), nsec.app (Web), Damus (iOS)
- Show loading spinner while waiting for remote approval
- Timeout after 2 minutes with "Try again" option
- QR auto-refreshes if expired

**Security:** Good. Private key stays on the mobile device. Communication is encrypted via NIP-04/NIP-44.

**When to use:** Mobile-first users, users who keep their key in a mobile app, users without browser extensions.

---

### 3. Paste nsec (Not Recommended)

**How it works:** User pastes their Nostr private key (nsec/hex) directly into the app. The app uses it to sign the challenge event client-side, then discards it. The key is **never sent to the server** — signing happens entirely in the browser.

**Flow:**
1. User pastes nsec (bech32) or hex private key
2. Client-side: decode nsec → derive pubkey → sign kind:22242 challenge event
3. Key is immediately discarded from memory (not stored anywhere)
4. Signed event sent to server → verified → session created

**UX:**
- Tab label: "Paste nsec"
- **Prominent warning banner** (red/orange) before the input:
  - "Pasting your private key in any website is risky. Your key will only be used to sign a login event and will NOT be stored or sent to any server. For better security, use a browser extension or Nostr Connect."
- Input field with type `password` (dots, not visible text)
- "Show" toggle to reveal the key
- Checkbox: "I understand the risks" (required to enable the Sign In button)
- After successful login, show confirmation: "Signed in. Your key was not stored."

**Security:** Lowest. The key is exposed to the browser's JavaScript context. Vulnerable to:
- Malicious browser extensions reading the DOM
- XSS attacks (if any exist) could capture the key
- User might accidentally paste in the wrong field

The key is never sent to the server or stored in cookies/localStorage/sessionStorage — it's used only for the in-memory signing operation and then dereferenced.

**When to use:** Users without extension or mobile app, testing, quick access from a device where they can't install anything. Common in the Nostr ecosystem despite the risks.

**Dependencies:** Need a library for nsec decoding and Schnorr signing client-side. Options:
- `@noble/secp256k1` — Lightweight, already standard in Nostr ecosystem
- `nostr-tools` — Has `nip19.decode()` for nsec and `finalizeEvent()` for signing

---

## Login Modal Layout

```
┌────────────────────────────────────────┐
│              Sign in with Nostr        │
│                                        │
│  ┌──────────┬──────────┬────────────┐  │
│  │Extension │ Scan QR  │ Paste nsec │  │
│  └──────────┴──────────┴────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │                                  │  │
│  │  (Content changes per tab)       │  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Don't have a Nostr account?           │
│  Learn more about Nostr →              │
│                                        │
└────────────────────────────────────────┘
```

### Tab: Extension
```
┌──────────────────────────────────┐
│                                  │
│       ⚡ (bolt icon)             │
│                                  │
│  Use your Nostr browser          │
│  extension to sign in.           │
│                                  │
│  [  Sign in with Extension  ]    │
│                                  │
│  ── or install one ──            │
│  Alby · nos2x · Nostr Connect   │
│                                  │
└──────────────────────────────────┘
```

### Tab: Scan QR
```
┌──────────────────────────────────┐
│                                  │
│  Scan with your Nostr app:       │
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │      ██████████████        │  │
│  │      ██  QR CODE  ██       │  │
│  │      ██████████████        │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│  Compatible: Amber · nsec.app   │
│              Damus              │
│                                  │
│  Waiting for approval...         │
│                                  │
└──────────────────────────────────┘
```

### Tab: Paste nsec
```
┌──────────────────────────────────┐
│                                  │
│  ⚠ Not recommended              │
│  Your private key will be used   │
│  to sign a login event only.     │
│  It will NOT be stored or sent   │
│  to any server.                  │
│                                  │
│  nsec or hex private key:        │
│  [••••••••••••••••••••••] 👁    │
│                                  │
│  ☐ I understand the risks        │
│                                  │
│  [       Sign in       ]         │
│                                  │
└──────────────────────────────────┘
```

---

## Server-Side — No Changes Needed

All three methods produce the same output: a **signed kind:22242 event**. The server doesn't know or care which method was used. The existing `POST /api/auth/nostr` endpoint works for all three.

The difference is purely client-side:
- Extension: `window.nostr.signEvent()`
- NIP-46: Remote signer via relay
- nsec: Local signing with `@noble/secp256k1` or `nostr-tools`

---

## Dependencies to Add

| Method | Library | Why |
|--------|---------|-----|
| Extension | (none, already works) | Uses `window.nostr` NIP-07 |
| QR / NIP-46 | `nostr-tools` | NIP-46 remote signer protocol, relay communication |
| Paste nsec | `nostr-tools` | `nip19.decode()` for nsec, `finalizeEvent()` for signing |
| QR display | `qrcode.react` or similar | Render the nostrconnect:// URI as QR |

`nostr-tools` covers both NIP-46 and nsec signing, so it's the only essential addition.

---

## Implementation Priority

1. **Extension** — Already done
2. **Paste nsec** — Simpler to implement (client-side only, no relay coordination)
3. **QR / NIP-46** — More complex (needs relay connection, polling, timeout handling), but best mobile UX
