# Settings Page

## Overview

Settings is a protected page (`/settings`) for authenticated users. It combines profile management, wallet connection, and preferences — similar to bitbybit-habits but adapted for Nostr-only auth.

## Sections

### 1. Profile

Since auth is Nostr-only, the profile is synced from Nostr relays. Users can edit locally and optionally push changes back to Nostr.

| Field | Source | Editable | Notes |
|-------|--------|----------|-------|
| **Display Name** | Nostr kind:0 `display_name` | Yes | Required |
| **Username** | Nostr kind:0 `name` | Yes | Required, min 3 chars |
| **Avatar URL** | Nostr kind:0 `picture` | Yes | Valid HTTP/HTTPS URL |
| **About** | Nostr kind:0 `about` | Yes | Short bio |
| **Lightning Address** | Nostr kind:0 `lud16` | Yes | Required for receiving prizes |
| **Language** | Local preference | Yes | es / en |

**Nostr Sync:**
- "Sync from Relays" button — fetches latest kind:0 metadata and updates local profile
- "Publish to Nostr" button — pushes local changes to relays (merges with existing metadata, preserves fields we don't manage)
- Auto-sync on first login (already implemented in auth route)

**Difference from Habits:** No email, no password, no 2FA (identity is managed by the Nostr extension). Simpler profile form.

### 2. Wallet (Copy from Habits)

Full NWC wallet management. This is a proven, working system from bitbybit-habits — copy it directly.

**Features to copy:**
- NWC URL input with QR scanner
- Optional wallet label
- Connect / disconnect wallet
- Balance display with refresh
- Send (pay BOLT11 invoice) with QR scanner
- Receive (generate invoice with amount + description)
- Transaction history (paginated, 20 per page)
- WebLN extension detection + preference toggle
- Connection dead detection + retry

**API routes to copy:**
- `POST /api/wallets` — Connect wallet (encrypt NWC URL, store)
- `GET /api/wallets` — Get wallet status (never expose encrypted URL)
- `DELETE /api/wallets` — Disconnect (soft delete)
- `GET /api/wallets/balance` — Fetch balance via NWC
- `POST /api/wallets/send` — Pay invoice via NWC
- `POST /api/wallets/receive` — Generate invoice via NWC
- `GET /api/wallets/transactions` — List transactions (paginated)

**Files to copy from habits:**
- `components/dashboard/wallet-connect/` — Full component + SCSS
- `app/api/wallets/` — All route handlers (balance, send, receive, transactions)
- `lib/crypto.ts` — AES-256-GCM encryption for NWC URLs
- `lib/hooks/useWebLN.ts` — WebLN extension detection hook

**DB changes needed:**
- `wallets` table already exists in schema
- Add `prefer_webln` boolean to `users` table

**Env vars needed:**
- `ENCRYPTION_KEY` — Base64-encoded 32-byte key for AES-256-GCM

### 3. Preferences

| Setting | Options | Default |
|---------|---------|---------|
| **Language** | Spanish, English | es |
| **Theme** | Light, Dark, System | System |
| **Prefer WebLN** | Toggle | Off (managed in wallet section) |

### 4. Danger Zone

- **Delete Account** — Removes user data from the database. Nostr identity and events on relays are unaffected (we don't control those). Requires confirmation modal.

---

## UI Layout

```
┌─────────────────────────────────┐
│  Settings                       │
├─────────────────────────────────┤
│                                 │
│  Profile                        │
│  ┌───────────────────────────┐  │
│  │ Display Name    [_______] │  │
│  │ Username        [_______] │  │
│  │ Avatar URL      [_______] │  │
│  │ About           [_______] │  │
│  │ Lightning Addr  [_______] │  │
│  │ Language        [es ▾   ] │  │
│  │                           │  │
│  │ [Sync from Relays]        │  │
│  │ [Save] [Publish to Nostr] │  │
│  └───────────────────────────┘  │
│                                 │
│  Wallet                         │
│  ┌───────────────────────────┐  │
│  │ (WalletConnect component  │  │
│  │  copied from habits)      │  │
│  └───────────────────────────┘  │
│                                 │
│  Preferences                    │
│  ┌───────────────────────────┐  │
│  │ Theme       [Light ▾]    │  │
│  └───────────────────────────┘  │
│                                 │
│  Danger Zone                    │
│  ┌───────────────────────────┐  │
│  │ [Delete Account]          │  │
│  └───────────────────────────┘  │
│                                 │
└─────────────────────────────────┘
```

---

## Why Wallet Matters for Challenges

- **Challenge creators** need a wallet to fund prize pools
- **Participants** need a Lightning address (in Nostr profile) or connected wallet to receive prizes
- **Zapping** uses the connected wallet or WebLN extension
- The wallet section on settings ensures users can manage their payment method before joining or creating challenges

---

## Implementation Priority

1. **Profile section** — Essential for identity
2. **Wallet section** — Copy from habits, critical for prize flow
3. **Preferences** — Theme toggle (quick win)
4. **Danger zone** — Low priority, implement last
