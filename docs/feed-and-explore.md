# Feed & Explore — Public Pages with Personalized Content

## Core Principle

Feed and Explore are **public pages**. Anyone can browse without logging in. Logged-in users get personalized content on top.

## Feed (`/feed`)

### Not logged in
- Shows global activity: recent challenge creations, completions, badge awards, prize payouts
- Acts as a "what's happening" public timeline
- Encourages sign-in to see personalized content

### Logged in
- Shows activity from **followed users** (Nostr follow list, NIP-02)
- Followed users' challenge joins, completions, badges, prizes
- Challenges created by followed users
- Zaps on completions from followed users
- Option to toggle between "Following" and "Global" feed

---

## Explore (`/explore`)

### Not logged in
- Browse all open challenges
- Full search, filter, and sort capabilities
- Can view challenge details but can't join (prompts sign-in)

### Logged in
- Same browsing + ability to join challenges and create new ones
- Personalized recommendations based on categories of joined challenges
- "Create a Challenge" button visible

---

## Search

Free-text search across:
- Challenge **title**
- Challenge **description**
- Challenge **category** tags
- Creator **username/display_name**

Search should be fast — indexed server-side on the database. Nostr relay search is a stretch goal (NIP-50 search).

---

## Filters

| Filter | Options | Default |
|--------|---------|---------|
| **Status** | Open, In Progress, Completed | Open |
| **Type** | One-time, Streak, Competition, Race, Creative | All |
| **Prize** | Has prize (any amount), No prize, Min sats amount | All |
| **Category** | Fitness, Learning, Creative, Social, Other (user-defined tags) | All |
| **Duration** | Ending soon (< 7 days), This month, No deadline | All |
| **Verification** | Creator approval, Community vote, Automatic | All |
| **Participants** | Any, < 10, 10-50, 50+ | Any |

Filters should be combinable (AND logic). URL query params for shareability (e.g., `/explore?status=open&type=streak&minPrize=1000`).

---

## Sort / Order

| Sort option | Description |
|-------------|-------------|
| **Newest** | Most recently created (default for Explore) |
| **Ending soon** | Challenges closest to their end date |
| **Most participants** | Highest participant count |
| **Highest prize** | Largest sat prize pool |
| **Most active** | Most recent completions/activity |
| **Trending** | Combination of recent joins + completions (time-weighted) |

For Feed: chronological (newest first) is the only sort, matching social feed expectations.

---

## UI Notes

- Search bar at top of Explore, always visible
- Filters as a horizontal chip bar (mobile-friendly, scrollable) or collapsible sidebar (desktop)
- Active filters shown as dismissable pills
- Sort as a dropdown next to the search bar
- Empty state when no results: "No challenges match your filters" with CTA to create one
- Loading state: block skeleton animation (not spinner)
- Infinite scroll or "Load more" button for pagination (cursor-based, not offset)

---

## API Endpoints Needed

```
GET /api/challenges?search=...&status=open&type=streak&sort=newest&cursor=...
GET /api/feed?scope=global|following&cursor=...
```

Both endpoints work without auth (public data). When authenticated, `/api/feed?scope=following` uses the user's Nostr follow list to filter.

---

## Implementation Priority

1. **Explore with search + filters + sort** — Most valuable for discoverability and hackathon demo
2. **Global feed** — Shows the app is alive with activity
3. **Following feed** — Requires Nostr follow list integration (NIP-02), do after core features work
