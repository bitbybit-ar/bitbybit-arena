# About page

Public page at `/[locale]/about`. No auth required. Linked from the landing page and the footer.

The page is a server component that just composes five client subcomponents in order:

```tsx
// app/[locale]/about/page.tsx
<Story />
<Projects />
<Team />
<LaCrypta />
<OpenSource />
```

All copy lives under the `about.*` namespace in `messages/es.json` and `messages/en.json`. Each subcomponent uses `useScrollReveal` and decorates with `Bubble` and `Block` components consistent with the landing-page identity (Bubbles for the "Habits" lineage, Blocks for the "Arena" lineage).

## Sections

### 1. Story (`components/about/Story/index.tsx`)

Four-paragraph narrative rendered with a `**bold**` markdown-style helper (`renderBold`) so individual phrases inside the i18n string can be emphasised without splitting the string into multiple keys.

- i18n keys: `about.story.title`, `about.story.p1`–`about.story.p4`.
- Visual: `BlockTower` (5 medium blocks, animated) on the right; two `Bubble`s (gold + Bolt, green + Heart) on the left at low opacity.

### 2. Projects (`components/about/Projects/index.tsx`)

Side-by-side comparison table, BitByBit Habits vs. BitByBit Arena. Eight rows: hackathon, theme, auth, users, rewards, data, status, link. The "link" row is the only one that renders an `<a>` (to https://bitbybit.com.ar); the rest are plain text from i18n.

- i18n keys: `about.projects.title`, `about.projects.habitsName` / `arenaName`, plus per-row `habits<Row>` / `arena<Row>` strings.
- Visual: three floating `Block`s (purple + Flag, gold + Trophy, green + Bolt) and a `PixelDissolve` at the section boundary.

### 3. Team (`components/about/Team/index.tsx`)

Four cards in a 2×2 grid (single column on mobile). Members are hardcoded in the component, each pointing at a GitHub avatar:

| key | github | colour |
|-----|--------|--------|
| `anix` | `analiaacostaok` | purple |
| `llopo` | `fabricio333` | gold |
| `wander` | `Pizza-Wder` | green |
| `leon` | `leonacostaok` | red |

- i18n keys: `about.team.title`, plus per-member `name` / `role` / `bio` under `about.team.members.<key>.*`.
- Avatars: `https://github.com/<username>.png` via `next/image`.
- Visual: two solid `Bubble`s (purple, gold) at the right edge.

### 4. La Crypta (`components/about/LaCrypta/index.tsx`)

Single card crediting La Crypta as the community behind both BitByBit hackathons.

- i18n keys: `about.lacrypta.title`, `about.lacrypta.description`, `about.lacrypta.visitSite`.
- Logo: `https://github.com/lacrypta.png?size=64`.
- Link: https://hackaton.lacrypta.ar.
- Visual: one floating gold + Bolt `Block` and a `PixelDissolve`.

### 5. OpenSource (`components/about/OpenSource/index.tsx`)

Repo links + invitation to contribute. Two `<a>`s with `GithubIcon`s:

- https://github.com/bitbybit-ar/bitbybit-arena
- https://github.com/bitbybit-ar/bitbybit-habits

- i18n keys: `about.openSource.title`, `description`, `contribute`, `arenaRepo`, `habitsRepo`.
- No PixelDissolve at the bottom — this is the last section before the footer.

## SEO

`generateMetadata` in `app/[locale]/about/page.tsx` sets `title` from the `metadata.about` i18n key and emits hreflang alternates via `alternatesFor(locale, "/about")` from `lib/seo.ts`.
