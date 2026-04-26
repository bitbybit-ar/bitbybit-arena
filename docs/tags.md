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

Tags are stored as a **text array** on the challenges table. PostgreSQL array operators (`@>`, `&&`) are used for filtering — the `tag` query param on `GET /api/challenges` runs `tags @> ARRAY[<tag>]` against the column.

```sql
-- Find challenges with tag "fitness"
SELECT * FROM challenges WHERE tags @> ARRAY['fitness'];

-- Find challenges with any of these tags
SELECT * FROM challenges WHERE tags && ARRAY['fitness', 'health'];
```

### Drizzle Schema

```typescript
tags: text("tags").array().notNull().default([]),
```

There is **no GIN index on `tags` today** — at current scale the table is small enough that the planner sequential-scans cheaply, and the existing B-tree indexes (`creator_id`, `status`, `type`, `ends_at`) already cut most queries down before the array predicate runs. If tag filtering becomes a hot path, add `index("challenges_tags_idx").using("gin", table.tags)` in a follow-up migration.

## Tag Rules

- **Lowercase only** — normalized on input (`"Fitness"` → `"fitness"`)
- **No spaces** — use hyphens (`"cold-shower"`, not `"cold shower"`)
- **Max 10 tags per challenge** — `MAX_TAGS` in `lib/schemas/primitives.ts`
- **Max 30 characters per tag**
- **Alphanumeric + hyphens only** — no special characters (`TAG_RE = /^[a-z0-9-]{1,30}$/`)
- **No duplicates** on same challenge — deduplicated case-insensitively after normalisation

## Tag suggestions

Tags are free-form. There is **no static seed list** — the `TagInput` component accepts any input that passes the validation rules above. The only "suggestion" surface today is `GET /api/tags/popular` (see API section below), which returns the most-used tags across the live database. A curated seed list (categorised by Fitness / Learning / Creative / etc.) is a candidate post-MVP addition.

## UI

### Challenge Creation Form
- Tag input field — free-form, accepts any tag that matches the validation rules above
- Tags displayed as colored pills below the input
- Remove tag by clicking the X on the pill
- Counter showing the current count vs `MAX_TAGS`

### Explore Page — Filter by Tags
- Popular tags from `GET /api/tags/popular` rendered as clickable chips in the filter bar
- Single-select today (the API takes one `tag` query param and runs `tags @> ARRAY[<tag>]`)
- Active tag filter shown as a dismissable pill above results

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
