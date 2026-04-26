# Settings Page

## Overview

Settings is a protected page (`/settings`) for authenticated users. It combines profile management and preferences — simpler than bitbybit-habits since there's no wallet management (zaps are handled by the user's own wallet).

## Sections

### 1. Profile

Since auth is Nostr-only, the profile is synced from Nostr relays. Users can edit locally and optionally push changes back to Nostr.

| Field | Source | Editable | Notes |
|-------|--------|----------|-------|
| **Display Name** | Nostr kind:0 `display_name` | Yes | Required |
| **Username** | Nostr kind:0 `name` | Yes | Required, min 3 chars |
| **Avatar URL** | Nostr kind:0 `picture` | Yes | Valid HTTP/HTTPS URL |
| **About** | Nostr kind:0 `about` | Yes | Short bio |
| **Lightning Address** | Nostr kind:0 `lud16` | Yes | Needed to receive zaps |

Language lives in the separate **Preferences** section below — it is a server-persisted user preference (`users.locale`), not a kind:0 metadata field, and saves through its own per-section sentinel so toggling language doesn't disable the Profile form.

**Nostr Sync:**
- "Sync from Relays" button — fetches latest kind:0 metadata and updates local profile
- "Publish to Nostr" button — pushes local changes to relays (merges with existing metadata, preserves fields we don't manage)
- Auto-sync on first login (already implemented in auth route)

### 2. Preferences

| Setting | Options | Default |
|---------|---------|---------|
| **Language** | Spanish, English | es |
| **Theme** | Light, Dark, System | System |

### 3. Danger Zone

- **Delete Account** — Soft-deletes the account. The `users` row is **kept** (so existing FK references from challenges, participants, completions, badges, and notifications stay intact and the public history remains coherent). The handler scrubs PII: `username` becomes `deleted_<shortId>`, `display_name` becomes `"[deleted]"`, and `avatar_url`, `about`, `lightning_address`, `nostr_metadata`, `nostr_metadata_updated_at` are nulled. `deleted_at` is stamped. The session cookie is cleared. Implementation: `DELETE /api/profile` in `app/api/profile/route.ts`. Nostr identity and events on relays are unaffected (we don't control those). Requires a confirmation modal in the UI.

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

## Implementation Priority

1. **Profile section** — Essential for identity
2. **Preferences** — Theme toggle (quick win)
3. **Danger zone** — Low priority, implement last
