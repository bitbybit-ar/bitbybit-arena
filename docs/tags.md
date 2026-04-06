# Challenge Tags

## Overview

Challenges have **tags** — short labels that categorize and describe what a challenge is about. Tags are essential for discovery (search, filter) and for Nostr interoperability (standard `t` tags in events).

## How Tags Work

### On Nostr Events

Tags use the standard `t` tag from NIP-01, making challenges discoverable by any Nostr client:

```json
{
  "kind": 30100,
  "tags": [
    ["t", "fitness"],
    ["t", "running"],
    ["t", "30days"],
    ...
  ]
}
```

### In the Database

Tags are stored as a **text array** on the challenges table. This enables fast filtering with PostgreSQL array operators (`@>`, `&&`).

```sql
-- Find challenges with tag "fitness"
SELECT * FROM challenges WHERE tags @> ARRAY['fitness'];

-- Find challenges with any of these tags
SELECT * FROM challenges WHERE tags && ARRAY['fitness', 'health'];
```

### Drizzle Schema Addition

```typescript
tags: text("tags").array().notNull().default([]),
```

With an index for fast lookups:
```typescript
index("challenges_tags_idx").using("gin", table.tags),
```

## Tag Rules

- **Lowercase only** — normalized on input (`"Fitness"` → `"fitness"`)
- **No spaces** — use hyphens (`"cold-shower"`, not `"cold shower"`)
- **Max 5 tags per challenge** — keeps things focused
- **Max 30 characters per tag**
- **Alphanumeric + hyphens only** — no special characters
- **No duplicates** on same challenge

## Suggested Tags (Seed List)

Pre-populated suggestions shown when creating a challenge. Users can also type custom tags.

| Category | Tags |
|----------|------|
| **Fitness** | `fitness`, `running`, `workout`, `yoga`, `cold-shower`, `steps`, `cycling`, `swimming` |
| **Learning** | `learning`, `reading`, `coding`, `language`, `writing`, `study` |
| **Creative** | `creative`, `photography`, `art`, `music`, `design`, `video` |
| **Health** | `health`, `meditation`, `nutrition`, `sleep`, `hydration`, `no-sugar` |
| **Social** | `social`, `community`, `volunteering`, `kindness`, `networking` |
| **Productivity** | `productivity`, `habits`, `morning-routine`, `no-phone`, `journaling` |
| **Bitcoin** | `bitcoin`, `lightning`, `nostr`, `stacking-sats`, `node-running` |
| **Fun** | `fun`, `cooking`, `travel`, `gaming`, `outdoor`, `challenge` |

## UI

### Challenge Creation Form
- Tag input field with autocomplete from the seed list
- Type to search or create custom tags
- Tags displayed as colored pills below the input
- Remove tag by clicking the X on the pill
- Counter showing "3/5 tags"

### Explore Page — Filter by Tags
- Tags appear as clickable chips in the filter bar
- Show popular tags (most used) as quick filters
- Multi-select: clicking multiple tags shows challenges matching **any** of them (OR logic)
- Active tag filters shown as dismissable pills above results

### Challenge Card
- Tags displayed as small pills at the bottom of the card
- Color-coded by first tag category (if it matches a known category) or neutral

### Feed
- Tags visible on challenge creation events
- Clicking a tag navigates to Explore filtered by that tag

## API

### In challenge endpoints

Tags are included in challenge creation/update requests:

```json
POST /api/challenges
{
  "title": "30-Day Cold Shower",
  "tags": ["fitness", "cold-shower", "30days"],
  ...
}
```

### Dedicated endpoint for discovery

```
GET /api/tags/popular?limit=20
```

Returns the most-used tags with counts, for showing popular tags in the UI:

```json
{
  "data": [
    { "tag": "fitness", "count": 45 },
    { "tag": "reading", "count": 32 },
    { "tag": "bitcoin", "count": 28 }
  ]
}
```

## Nostr Interoperability

Because we use the standard `t` tag, any Nostr client that supports hashtag filtering can find our challenges. This is a key advantage — challenges aren't siloed in our app.

A user searching for `#fitness` on Damus, Primal, or any client would see BitByBit challenges alongside regular notes tagged with `fitness`.
