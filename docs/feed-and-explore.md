# Explore — Browse and Discover Challenges

## Core Principle

Explore is a **public page**. Anyone can browse without logging in. Logged-in users can join challenges and create new ones.

## Explore (`/explore`)

### Not logged in
- Browse all open challenges
- Full search, filter, and sort capabilities
- Can view challenge details but can't join (prompts sign-in)

### Logged in
- Same browsing + ability to join challenges and create new ones
- "Create a Challenge" button visible
- Personalised by your **NIP-02 follow list** (kind 3): challenges from creators you follow get a soft boost so they float to the top of the default feed. Use the **Only following** toggle to scope the list strictly to those creators (see [Filters](#filters) below).

---

## Search

Free-text search across:
- Challenge **title**
- Challenge **description**
- Challenge **category** tags
- Creator **username/display_name**

Search should be fast — indexed server-side on the database.

---

## Filters

| Filter | Options | Default |
|--------|---------|---------|
| **Status** | Open, In Progress, Completed | Open |
| **Type** | One-time, Streak, Competition, Race, Creative | All |
| **Category** | Fitness, Learning, Creative, Social, Other (user-defined tags) | All |
| **Duration** | Ending soon (< 7 days), This month, No deadline | All |
| **Verification** | Creator approval, Automatic, Nostr action (NIP-25 like), Nostr hashtag (kind:1 with `#t`) | All |

Filters should be combinable (AND logic). URL query params for shareability (e.g., `/explore?status=open&type=streak`).

### Follow-aware filtering (logged-in users)

When the signed-in user has a NIP-02 follow list (kind 3), Explore exposes two follow-driven behaviours, both driven by `lib/hooks/useFollowList.ts`:

- **Soft boost (always on):** challenges whose creator is in your follow list float to the top of the result set, but unfollowed creators still appear below them. Lets you discover new challenges without losing the ones from people you already trust.
- **Only following (toggle):** scopes the result set strictly to challenges whose creator is in your follow list. Useful when you want a "people I follow" feed without any discovery noise.

Both are pure client-side toggles on top of the same `GET /api/challenges` query — no separate "for-you" endpoint, no server-side personalisation state.

---

## Sort / Order

| Sort option | Description | Status |
|-------------|-------------|--------|
| **Newest** | Most recently created (default) | Shipped |
| **Ending soon** | Challenges closest to their end date (`ends_at` ascending) | Shipped |
| **Most active** | Most recently updated challenge row (`challenges.updated_at` descending) — bumps on joins, completions, edits, and status changes, so it acts as a lightweight activity proxy without a per-sort aggregate query | Shipped |
| **Most participants** | Highest active participant count (excludes withdrawn), tiebreak by `created_at` descending | Shipped |
| **Trending** | Recent-momentum score over the last 7 days: `joins + 2 * completions`. Completions are weighted double because actually doing the thing is a stronger signal than just joining. Tiebreak by `created_at` descending. | Shipped |

---

## UI Notes

- Search bar at top, always visible
- Filters as a horizontal chip bar (mobile-friendly, scrollable) or collapsible sidebar (desktop)
- Active filters shown as dismissable pills
- Sort as a dropdown next to the search bar
- Empty state when no results: "No challenges match your filters" with CTA to create one
- Loading state: block skeleton animation (not spinner)
- Infinite scroll or "Load more" button for pagination (cursor-based, not offset)

---

## API Endpoint

```
GET /api/challenges?search=...&status=open&type=streak&sort=newest&cursor=...
```

Works without auth (public data).
