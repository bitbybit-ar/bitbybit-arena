# Landing Page Design

> Status: implemented. This doc reflects what actually ships in `app/[locale]/page.tsx` and `components/landing/*`.

## Structure

```
┌─────────────────────────────────────────┐
│  Navbar                                 │
│  [Logo]  [Theme] [Locale] [Explore]     │
│                         [Sign In]       │
├─────────────────────────────────────────┤
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  ░░  Hero (dark, spotlight)         ░░  │
│  ░░  Headline + pixel sword icon    ░░  │
│  ░░  Arena floor dot grid           ░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  ▓▓▓ pixel dissolve transition ▓▓▓▓▓▓  │
├─────────────────────────────────────────┤
│  How It Works                           │
│  3 steps: Crear → Batallá → Ganá        │
│  Cards with colored badges + pixel icons│
│  ▓▓▓ pixel dissolve ▓▓▓                 │
├─────────────────────────────────────────┤
│  About                                  │
│  "La familia BitByBit"                  │
│  Habits card + Arena card (side by side)│
│  Bubbles on Habits side, Blocks on Arena│
│  ▓▓▓ pixel dissolve ▓▓▓                 │
├─────────────────────────────────────────┤
│  Partners                               │
│  La Crypta + Nostr WoT cards            │
│  ▓▓▓ pixel dissolve ▓▓▓                 │
├─────────────────────────────────────────┤
│  Support                                │
│  "Zapeá a los devs" + "Estrella GitHub" │
│  ZapModal (WebLN or QR fallback)        │
├─────────────────────────────────────────┤
│  Footer                                 │
│  Hackathon #2 de La Crypta + links      │
└─────────────────────────────────────────┘

░ = dark hero zone with spotlight lighting
▓ = PixelDissolve component (scattered tiny blocks)
```

---

## Design Philosophy: Pixel Battlefield + Arena Spotlight

No glassmorphism. No generic floating circles as the dominant motif. BitByBit Arena has a **battlefield identity** built from blocks — the core BitByBit visual element.

### The Concept

The landing page feels like entering a **pixel-art arena**. The hero is dark and dramatic with spotlight lighting, like walking from a tunnel into a lit arena. As you scroll, the page brightens — you've entered the battlefield.

### Blocks as the signature element

Blocks are the primary decorative element across every section:
- **Pixel-art icons** — sword, shield, trophy, flag built from small colored blocks (see `components/common/PixelIcon`)
- **Floating decorators** — colored blocks with icons inside (`FlagIcon`, `TrophyIcon`, `BadgeIcon`, `BoltIcon`) drifting at section edges
- **Section transitions** — `PixelDissolve` scatters tiny blocks along the boundary of each section
- **Arena terrain** — a sparse radial-gradient dot pattern in the hero background

### Bubbles are used sparingly (About section only)

The `Bubble` component is kept in the design system and reused deliberately in the **About** section to represent the **Habits** side of the ecosystem comparison (organic, playful, kid-friendly). The **Arena** side uses blocks (sharp, competitive). This contrast is intentional — it makes the family vs. competition distinction visual.

---

## Color Palette

Clean, high-contrast. Values defined in `styles/_colors.scss` and `styles/_theme.scss`.

### Light Theme (Default)

| Role | Color | Hex |
|------|-------|-----|
| Background | White | `#FFFFFF` |
| Surface | Warm Gray | `#F7F7F8` |
| Text Primary | Near Black | `#1A1A2E` |
| Text Secondary | Cool Gray | `#6B7280` |
| Purple (primary) | Nostr Purple | `#8B5CF6` |
| Gold (secondary) | Sats Gold | `#F7A825` |
| Green (accent-alt) | Success Green | `#22C55E` |
| Red (accent) | Energy Red | `#EF4444` |

### Dark Theme

| Role | Color | Hex |
|------|-------|-----|
| Background | Navy | `#0F0F1A` |
| Surface | Dark Navy | `#1A1A2E` |
| Text Primary | White | `#F0F0F5` |
| Text Secondary | Muted Lavender | `#9CA3AF` |
| Purple | Bright Purple | `#A78BFA` |
| Gold | Sats Gold | `#F7A825` |
| Green | Bright Green | `#34D399` |
| Red | Bright Red | `#F87171` |

### Accent Usage
- **Purple**: Primary buttons, links, Nostr-related elements, active states
- **Gold**: Sat amounts, zap CTA, rewards
- **Green**: Completed states, progress, success
- **Red**: Competition heat, decorative energy blocks

### Card Styling (No Glass)

Solid surface backgrounds with subtle borders. No blur, no backdrop-filter.

---

## Arena Lighting System

### Spotlight Effect (Hero only)

The hero uses a dark background with two CSS radial-gradient spotlights — no images, no blur filters. Implemented as `.spotlight` inside `hero.module.scss`, animated by `spotlight-pulse` (8s infinite, very subtle).

- Primary spotlight is purple, low opacity (atmospheric, not flashy).
- Secondary spotlight is gold, hinting at sats rewards.

### Dark-to-Light Progression

The hero is always dark; subsequent sections use theme-aware backgrounds so the page brightens (or stays dark in dark mode).

| Section | Background |
|---------|-----------|
| Hero | Dark navy + spotlights (always dark) |
| How It Works | Theme background |
| About | Theme surface |
| Partners | Theme background |
| Support | Theme surface |
| Footer | Theme surface |

### Arena Floor Grid (Hero)

A sparse pixel-art dot pattern sits behind the hero content as `.arenaFloor`, implemented as a repeating radial-gradient at low opacity. Hidden on mobile where it would be too subtle to read.

---

## Block System

### Block component

Source: `components/common/Block/index.tsx`.

```tsx
interface BlockProps {
  size: 'tiny' | 'small' | 'medium' | 'large'; // 16, 32, 48, 64
  color: 'purple' | 'gold' | 'green' | 'red';
  animation?: 'drop' | 'pulse' | 'none';
  delay?: number;
  flat?: boolean;
  children?: ReactNode; // used to embed icons inside the block
}
```

Blocks accept children — the landing pattern is to drop an icon (`FlagIcon`, `BoltIcon`, `TrophyIcon`, `BadgeIcon`, `GithubIcon`) inside a colored block, producing "floating labeled tiles" scattered around each section.

### PixelIcon component

Source: `components/common/PixelIcon/index.tsx`.

Renders pixel art from a 2D grid of colored mini-blocks. Available `shape` values: `sword`, `shield`, `trophy`, `flag`, `vs`, `lightning`. Used on the landing:

- **Hero**: `shape="sword"` (purple blade, gold crossguard, red grip, green pommel) — the signature hero visual.
- **HowItWorks**: `flag` (step 1), `shield` (step 2), `trophy` (step 3), one per card.

`vs` and `lightning` shapes exist in the component but are not currently used on the landing.

### PixelDissolve component

Source: `components/common/PixelDissolve/index.tsx`. Renders a fixed pattern of tiny scattered blocks (purple/gold/green/red, opacity 0.06–0.25). Placed at the **bottom** of Hero, HowItWorks, About, and Partners as a section-boundary effect. It is *not* used between cards within a section.

### BlockTower

`components/common/BlockTower` exists for app-level loaders but is **not used** on the landing page.

### Bubble

Source: `components/common/Bubble/index.tsx`. Used **only in About** to decorate the Habits card (organic/playful counterweight to the block motif).

---

## Sections Detail

All i18n keys below live under the `landing.*` namespace in `messages/es.json` and `messages/en.json`. Spanish strings are shown.

### 1. Navbar

Source: `components/layout/Navbar/index.tsx`.

- **Left**: Logo — three tiny blocks (purple, gold, green) + "BitByBit Arena" wordmark.
- **Right**: Theme toggle, locale toggle (ES/EN), "Explore" button, and either a "Sign In" button or the signed-in user's avatar menu.
- **Scroll behavior**: Adds a `.scrolled` class on scroll (background fades in, bottom border appears). Can auto-hide on scroll-down via `.hidden`.

### 2. Hero

Source: `components/landing/Hero/index.tsx`. Always dark, even in light mode.

**Content** (keys under `landing.hero`):
- Headline (two lines): **"Entrá a la Arena."** (purple) / **"Conquistá Sats."** (gold)
- Subtitle / manifesto: *"¿Y si cualquiera pudiera desafiar a cualquiera, y las victorias vivieran en Nostr para siempre?"*
- CTA primary: **"Explorar la Arena"** → `/explore`
- CTA secondary: **"Lanzar un desafío"** → `/explore`

**Visual elements:**
- **Pixel sword** (`PixelIcon shape="sword" blockSize={16} animate`) sits to the right of the headline. Blocks assemble with the drop animation.
- **Arena floor grid** — `.arenaFloor` radial-gradient dot pattern, 32px spacing, masked to fade at edges. Hidden on mobile.
- **Spotlights** — two radial gradients (purple primary, gold secondary) animated by `spotlight-pulse` (8s infinite, ~2% opacity shift).
- **Floating decorator blocks** — 5 medium blocks with icons (purple+Flag, gold+Trophy, green+Badge, red+Bolt, purple+Flag), drifting via `hero-drift-a` / `hero-drift-b` (4.5–6s infinite).
- **PixelDissolve** at the bottom.

**Entrance animations:** `fadeInUp` (0.6s cubic-bezier) staggered across headline → subtitle → CTAs → pixel sword.

**Note:** There is no separate "Built on Nostr" pill/badge and no "BATTLE FOR SATS" secondary tagline — the two-line headline plus manifesto subtitle carry the tone.

### 3. How It Works

Source: `components/landing/HowItWorks/index.tsx`.

**Content** (keys under `landing.howItWorks`):
- Title: **"Cómo funciona"**
- Subtitle: *"Creá desafíos, competí por sats y ganá badges que viven en tu identidad Nostr."*

**Three steps:**

| # | Badge color | PixelIcon | Title | Description |
|---|-------------|-----------|-------|-------------|
| 1 | Purple | `flag` | **Creá** | "Definí las reglas, duración y fondeá con sats. Tu arena se publica en Nostr para que cualquiera la descubra." |
| 2 | Green | `shield` | **Batallá** | "Entrá a desafíos, enviá tu prueba de victoria y seguí tu progreso." |
| 3 | Gold | `trophy` | **Ganá** | "Conquistá desafíos para ganar badges NIP-58 en tu identidad Nostr. Tus victorias se celebran en toda la red." |

**Layout:** Three cards in a row on desktop, stacked on mobile. Each card has:
- Colored numbered badge in the top-left (solid square tile, not glass).
- `PixelIcon` inside the card body (`blockSize={8}`).
- Title + description.

**Decoration:** 6 floating blocks scattered around the section (purple/gold/green/red, various sizes) with `drift-a` / `drift-b` / `drift-c` animations (4–6s infinite). **There is no pixel trail or scattered-block path *between* the cards** — the only `PixelDissolve` is at the section boundary.

**Scroll reveal:** cards use `scroll-reveal-stagger` and fade in on scroll.

### 4. About

Source: `components/landing/About/index.tsx`.

**Content** (keys under `landing.about`):
- Title: **"La familia BitByBit"**
- Description: *"BitByBit cree que el esfuerzo merece bitcoin. Empezamos premiando a los chicos por sus hábitos. Ahora, la arena premia a todos los que se animan a competir."*

**Two comparison cards:**

| BitByBit Habits (left) | BitByBit Arena (right, `.active`) |
|------------------------|-----------------------------------|
| Privado y familiar | Público y competitivo |
| Rutinas diarias | Batallas con tiempo límite |
| El sponsor premia al chico | La arena corona campeones |
| Link: "Visitar bitbybit.com.ar →" | Badge: "Estás acá" |

The Arena card has an `.arenaGlow` (subtle purple radial gradient behind it) and a colored border accent; it is marked active.

**Decoration — two competing motifs:**
- **Bubbles** (Habits identity): three `Bubble` components at the left edge of the section — gold+Bolt, green+Heart, gold+Trophy — with `float` / `drift` / `float-slow` animations.
- **Blocks** (Arena identity): three medium `Block`s with icons — purple+Flag, red+Bolt, green+Badge — with `block-drift-a` / `block-drift-b` animations.

**There is no pixel "VS" divider between the cards.** The contrast between bubbles and blocks carries the comparison.

**PixelDissolve** at the bottom of the section.

### 5. Partners

Source: `components/landing/Partners/index.tsx`.

**Content** (keys under `landing.partners`):
- Title: **"Partners"**
- Subtitle: *"Construyendo el futuro de Nostr, juntos."*

**Two partner cards:**

| Partner | Logo | Description | Link |
|---------|------|-------------|------|
| **La Crypta** | GitHub avatar (lacrypta.png) | "Comunidad Bitcoin en Argentina" | https://lacrypta.ar |
| **Nostr WoT** | /images/partners/nostr-wot.webp | "Web of Trust para Nostr" | https://nostr-wot.com/ |

**Visual:**
- Logo opacity is 0.6 by default and animates to 1 on hover. This is an **opacity fade** plus a **colored hover shadow** (La Crypta: gold; Nostr WoT: purple) — *not* a grayscale-to-color filter.
- Each card has a colored accent tied to its partner identity.
- Three floating blocks (purple+Flag, gold+Bolt, green+Trophy) drift via `partner-drift-a` / `partner-drift-b`.
- PixelDissolve at the bottom.

### 6. Support

Source: `components/landing/Support/index.tsx` (+ `components/landing/ZapModal/index.tsx`).

**Content** (keys under `landing.support`):
- Title: **"Apoyá a BitByBit"**
- Subtitle: *"Código abierto y hecho por la comunidad. Ayudanos a seguir construyendo."*

**Two CTAs:**
- **"Zapeá a los devs"** (gold button, BoltIcon) — opens the `ZapModal`.
- **"Dar estrella en GitHub"** (surface button, GithubIcon) — links to https://github.com/bitbybit-ar/bitbybit-arena.

**Decoration:** two medium floating blocks (gold+Bolt, purple+Github) with `support-drift-a` / `support-drift-b` animations.

#### ZapModal

The Lightning payment flow:
- Preset amounts: **21, 100, 500, 1000, 5000** sats.
- Optional custom amount + optional comment (≤140 chars).
- **WebLN first**: tries the browser extension (e.g. Alby); if unavailable, falls back to a **QR code** plus copy-invoice button.
- Polls for payment status and shows a success state with **pixel confetti** (24 particles in 5 colors, `confetti-fall` animation).
- Error handling with retry.

There is no standalone QR code or Lightning address rendered directly on the section — everything lives inside the modal.

### 7. Footer

Source: `components/layout/Footer/index.tsx`.

- **Brand**: three tiny blocks (purple/gold/green) + "BitByBit Arena".
- **Links**: "Sobre nosotros", GitHub, "BitByBit Habits".
- **Hackathon credit**: *"Construido para Hackathon #2 de La Crypta"*, rendered alongside the La Crypta logo.
- **Motto**: "Bitcoin o Muerte" with a purple → gold → green gradient text effect.
- Subtle top border, surface background, compact height.

---

## Animation Inventory

Actual class/keyframe names present in the landing SCSS and the shared `styles/globals.scss` reveal utilities.

| Animation | Where | Notes |
|-----------|-------|-------|
| `fadeInUp` | Hero headline / subtitle / CTAs / pixel sword | 0.6s cubic-bezier, staggered |
| `spotlight-pulse` | Hero spotlight gradients | 8s infinite, subtle opacity shift |
| `hero-drift-a` / `hero-drift-b` | Hero floating blocks | 4.5–6s infinite |
| `drift-a` / `drift-b` / `drift-c` | HowItWorks floating blocks | 4–6s infinite |
| `block-drift-a` / `block-drift-b` | About floating blocks | 4.5–6s infinite |
| `partner-drift-a` / `partner-drift-b` | Partners floating blocks | 4.5–6s infinite |
| `support-drift-a` / `support-drift-b` | Support floating blocks | 5–5.5s infinite |
| `float` / `drift` / `float-slow` | About Bubbles (Habits identity) | Shared bubble animations |
| `scroll-reveal` / `scroll-reveal-stagger` | HowItWorks cards, About cards, Partners cards | Driven by `useScrollReveal` hook |
| `block-drop` / `block-pulse` | Shared Block component | Reused from habits BlockLoader DNA |
| `confetti-fall` | ZapModal success state | 24 particles, 5 colors |
| `bolt-bounce` / `fade-in` / `pulse-text` | ZapModal states | |

### Reduced motion

All decorative animations collapse via `@media (prefers-reduced-motion: reduce)`: floating blocks, spotlight pulse, and scroll-reveal transforms become static while content remains fully visible.

---

## Component Breakdown

```
components/
  common/
    Block/                 <- Colored tile with optional inner icon
    BlockTower/            <- Loader (not used on landing)
    Bubble/                <- Organic circular decorator (About only)
    PixelIcon/             <- sword | shield | trophy | flag | vs | lightning
    PixelDissolve/         <- Scattered-block section boundary
    Tooltip/ OptionCard/ TagInput/ FormDivider/   (non-landing)
  landing/
    Hero/                  <- index.tsx + hero.module.scss
    HowItWorks/
    About/
    Partners/
    Support/
    ZapModal/              <- Lightning payment flow (WebLN + QR fallback)
  layout/
    Navbar/
    Footer/
    SignerProviderClient.tsx
    ReSignInModal/
    SignerRequiredNotice/
    AppBackgroundDecor/ AppPageHeader/   (app-shell, not landing)
  icons/                   <- SVG icons as React components
```

Notes:
- There is **no** `ArenaFloor` component — the hero dot grid is a SCSS class (`.arenaFloor`) inside `hero.module.scss`, not an extracted component.
- `NostrLoginModal` referenced in older drafts is implemented as `ReSignInModal` under `components/layout/`.
- `ZapModal` is a landing-scoped component and does not exist in older versions of this doc.

---

## Mobile Considerations

- **Hero**: pixel sword moves above the headline (centered), spotlights remain, arena floor grid is hidden.
- **HowItWorks**: cards stack vertically; floating blocks reduced.
- **About**: cards stack vertically; bubbles and blocks both remain but with reduced density.
- **Partners**: cards wrap to a single column.
- **Support**: buttons stack; `ZapModal` is full-height friendly.
- **Navbar**: compact — logo + Sign In, theme/locale toggles condense.
- **PixelDissolve**: same markup, smaller footprint at section boundaries.
- Safe-area-inset padding for iPhone notch handled in the global layout.