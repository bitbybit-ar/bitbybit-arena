# Landing Page Design

## Structure

```
┌─────────────────────────────────────────┐
│  Navbar                                 │
│  [Logo]                    [Sign In]    │
├─────────────────────────────────────────┤
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░  Hero (dark, spotlight)         ░░  │
│  ░░  Headline + pixel sword/flag    ░░  │
│  ░░  Arena floor grid fading out    ░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ▓▓▓ pixel dissolve transition ▓▓▓▓▓▓  │
├─────────────────────────────────────────┤
│                                         │
│  How It Works                           │
│  3 steps: Create → Battle → Earn        │
│  Connected by pixel trail               │
│                                         │
├─── ■ ■ · ■ · · ■ ■ pixel divider ──────┤
│                                         │
│  About BitByBit                         │
│  Habits vs Arena (VS block between)     │
│                                         │
├─── ■ · ■ · ■ · · ■ pixel divider ──────┤
│                                         │
│  Partners                               │
│  La Crypta + Nostr WoT logos            │
│                                         │
├─── ■ ■ · · ■ · ■ pixel divider ────────┤
│                                         │
│  Support the Project                    │
│  Donate via Lightning + contribute      │
│                                         │
├─────────────────────────────────────────┤
│  Footer                                 │
│  Built for Hackathon #2 + La Crypta     │
└─────────────────────────────────────────┘

■ = decorative blocks (pixel battlefield aesthetic)
░ = dark hero zone with spotlight lighting
```

---

## Design Philosophy: Pixel Battlefield + Arena Spotlight

No glassmorphism. No generic floating circles. BitByBit Arena has a **battlefield identity** built entirely from blocks — the core BitByBit visual element.

### The Concept

The landing page feels like entering a **pixel-art arena**. The hero is dark and dramatic with spotlight lighting, like walking from a tunnel into a lit arena. As you scroll down, the page gradually brightens — you've entered the battlefield and can see the full arena.

### One Signature Element: Blocks

Blocks are the **only** decorative element. No bubbles. Blocks represent everything:
- **Arena terrain** — sparse pixel-art floor patterns at low opacity
- **Pixel-art icons** — swords, shields, trophies, flags built from small colored blocks
- **Section dividers** — pixel dissolve edges where blocks scatter along boundaries
- **Depth and shadow** — blocks at varying opacity simulate the spotlight lighting
- **Progress and victory** — blocks fill, stack, and assemble to show achievement

### Why This Works
- **Blocks** = the BitByBit DNA. Every visual element is built from the same primitive — reinforcing "bit by bit"
- **Arena spotlight** = drama and stakes. The dark-to-light progression feels like entering a competition
- **Pixel aesthetic** = distinctive, memorable, and impossible to confuse with generic SaaS landing pages
- **Unified system** = one element (blocks) doing all the work creates visual coherence instead of competing systems

---

## Color Palette

Clean, high-contrast. No muddy blurs or frosted overlays.

### Light Theme (Default)

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Background** | White | `#FFFFFF` | Page background |
| **Surface** | Warm Gray | `#F7F7F8` | Card backgrounds, alternate sections |
| **Text Primary** | Near Black | `#1A1A2E` | Headings, body |
| **Text Secondary** | Cool Gray | `#6B7280` | Descriptions, captions |
| **Purple** | Nostr Purple | `#8B5CF6` | Primary actions, Nostr identity, key accents |
| **Gold** | Sats Gold | `#F7A825` | Rewards, prizes, sats references |
| **Green** | Success Green | `#22C55E` | Completions, progress, positive states |
| **Red** | Energy Red | `#EF4444` | Alerts, urgency, competition heat |

### Dark Theme

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Background** | Navy | `#0F0F1A` | Page background |
| **Surface** | Dark Navy | `#1A1A2E` | Card backgrounds, alternate sections |
| **Text Primary** | White | `#F0F0F5` | Headings, body |
| **Text Secondary** | Muted Lavender | `#9CA3AF` | Descriptions, captions |
| **Purple** | Bright Purple | `#A78BFA` | Slightly lighter for dark bg contrast |
| **Gold** | Sats Gold | `#F7A825` | Same as light |
| **Green** | Bright Green | `#34D399` | Slightly lighter for dark bg |
| **Red** | Bright Red | `#F87171` | Slightly lighter for dark bg |

### Accent Usage Rules
- **Purple**: Primary buttons, links, Nostr-related elements, active states
- **Gold**: Sat amounts, prizes, rewards, lightning bolt icons
- **Green**: Completed states, progress bars, success messages, badge earned
- **Red**: Competition elements (timers, "hot" challenges), error states

### Card Styling (No Glass)

Cards use **solid backgrounds with subtle borders and shadows** instead of glassmorphism:

```scss
// Light theme card
background: $color-surface;
border: 1px solid rgba($color-text-primary, 0.08);
border-radius: $border-radius-lg;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

// Dark theme card
background: $color-surface;
border: 1px solid rgba(255, 255, 255, 0.06);
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

// Hover: lift + colored shadow based on context
&:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba($color-purple, 0.12);
}
```

No blur, no transparency, no backdrop-filter. Clean, solid, fast.

---

## Arena Lighting System

### The Spotlight Effect

The hero section uses a dark background (navy `#0F0F1A`) with **radial gradient spotlights** that simulate arena lighting. These are pure CSS — no images, no blur filters.

```scss
// Hero spotlight — centered on content area
.hero {
  background:
    radial-gradient(ellipse 600px 400px at 50% 40%, rgba($color-purple, 0.08) 0%, transparent 70%),
    radial-gradient(ellipse 300px 300px at 30% 60%, rgba($color-gold, 0.04) 0%, transparent 70%),
    $color-background-dark;
}
```

**Rules:**
- Spotlights use accent colors at very low opacity (4-8%) — atmospheric, not flashy
- Max 2-3 spotlights per section to avoid muddy overlaps
- The primary spotlight is always purple (Nostr/Arena identity)
- A secondary gold spotlight hints at the sats reward

### Dark-to-Light Progression

The landing page transitions from dark to light as you scroll:

| Section | Background | Feel |
|---------|-----------|------|
| **Hero** | Dark navy + spotlights | Walking into the arena tunnel |
| **How It Works** | Dark navy, no spotlights | Inside the arena, eyes adjusting |
| **About** | Surface color (light gray / dark navy) | The open arena floor |
| **Partners** | Background color | Full daylight |
| **Support** | Surface color (slightly darker) | Calm, grounded |
| **Footer** | Surface color | Grounded |

In dark mode, the entire page stays dark but the spotlight intensity increases in the hero.
In light mode, the hero is still dark (forced) and the transition goes to the light palette.

### Blocks in the Shadows

Decorative blocks at the edges of the hero have **varying opacity** (3-15%) to simulate depth. Blocks closer to a spotlight are brighter; blocks in the shadows are almost invisible. This creates a sense of 3D space without any actual 3D rendering.

```scss
.block-shadow {
  opacity: 0.05;
  transition: opacity 0.6s ease;

  // Blocks near spotlight get brighter
  &.lit { opacity: 0.15; }
}
```

---

## Block System (Evolved from Loader)

### The BlockLoader DNA

The habits BlockLoader stacks colored squares (52px) with a drop-in bounce animation, glass highlights, and a colored glow underneath. We keep the soul but evolve it:

### What Changes

| Aspect | Habits Loader | Arena Design System |
|--------|---------------|--------------------------|
| **Context** | Loading indicator only | Full design element (decorative, interactive, structural) |
| **Glass effect** | Glass highlight on each block | Solid fill with subtle inner shadow (no glass) |
| **Glow** | Blurred ellipse under tower | Colored shadow that matches block color |
| **Colors** | 5 colors, random shuffle | 4 colors (purple, gold, green, red), contextual assignment |
| **Sizes** | Fixed 52px | Variable: 16px (tiny), 32px (small), 48px (medium), 64px (large) |
| **Animation** | Drop-in + fade cycle | Multiple: drop, stack, scatter, pulse, assemble |

### Block Uses on the Landing

**1. Hero Pixel Weapon (signature visual)**
Instead of a generic block tower, the hero features a **pixel-art sword, flag, or shield** built from colored blocks. It's recognizably pixel art but uses the BitByBit block style (rounded corners, colored shadows, inner highlights). The weapon assembles block by block with the familiar drop-bounce animation, as if being forged in the arena.

```
        ■              (purple — blade tip)
        ■■             (purple — blade)
        ■■             (purple — blade)
       ■■■             (purple — blade widens)
        ██             (gold — crossguard)
      ██████           (gold — crossguard)
        ██             (red — grip)
        ██             (red — grip)
        ■■             (green — pommel)
```

Alternative: a **pixel flag** (simpler, more neutral) or a **pixel trophy** (reward-focused). The weapon/flag sits to the right of the hero text and is lit by the spotlight from below.

**2. Arena Floor Grid**
The hero background includes a very sparse **pixel grid pattern** — tiny blocks (4-8px) at 2-4% opacity arranged in a loose grid, fading toward the edges. This suggests an arena floor or battlefield terrain without being literal. The grid is denser near the center (under the spotlight) and dissolves into nothing at the edges.

```scss
// CSS-only arena floor (repeating gradient or SVG pattern)
.arena-floor {
  background-image:
    radial-gradient(circle 2px, rgba($color-purple, 0.03) 100%, transparent 100%);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%);
}
```

**3. Pixel Dissolve Section Transitions**
Instead of clean section boundaries, sections transition through a **pixel dissolve edge** — tiny blocks scattered along the boundary, denser in the middle and sparse at the sides. This looks like terrain breaking apart or a pixelated fade.

```
Section A content
                ■   ■
          ■ ■ ■   ■   ■
      ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
  ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Section B content
```

**4. Pixel-Art Icons**
Small icons built from blocks (8-16px blocks in 3x3 to 5x5 grids) placed near relevant sections:
- **Sword** (hero) — competition, battle
- **Shield** (how it works) — defense, proof, verification
- **Trophy** (earn step) — victory, badges
- **Lightning bolt** (support) — sats, zaps
- **Flag** (create step) — starting a challenge

These are not SVGs — they're actual Block components arranged in a grid, so they inherit all block styling (shadows, colors, hover effects).

**5. Shadow Blocks (depth decorations)**
Blocks at varying opacities scattered at section edges, simulating depth from the arena lighting. Blocks closer to spotlights are brighter (10-15% opacity), blocks in shadows are near-invisible (3-5%). They drift very slowly (20s+ animation cycle) to add subtle life.

**6. Progress Blocks**
In challenge cards, progress is shown as a row of blocks filling left-to-right:

```
[■][■][■][■][■][□][□][□][□][□]  5/10 completed
 G   G   P   R   G                (colored per completion)
```

**7. Interactive Block Confetti**
On hover over cards or CTA buttons, tiny blocks (4-8px) burst outward from the hover point like pixel sparks. Subtle, fast (300ms), arena-themed — like sparks flying from a clash of swords.

### Block Component

```tsx
interface BlockProps {
  size: 'tiny' | 'small' | 'medium' | 'large';  // 16, 32, 48, 64px
  color: 'purple' | 'gold' | 'green' | 'red';
  animation?: 'drop' | 'pulse' | 'none';
  delay?: number;
  radius?: number;  // border-radius, default 4px (more angular than bubbles)
}
```

### Block Styling (No Glass)

```scss
.block {
  background: $block-color;
  border-radius: 4px;
  box-shadow:
    0 2px 4px rgba($block-color, 0.2),       // colored shadow
    inset 0 1px 0 rgba(255, 255, 255, 0.15); // subtle inner highlight (not glass, just depth)

  // Hover: slight scale + brighter shadow
  &:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba($block-color, 0.3);
  }
}
```

---

## Sections Detail

### 1. Navbar

Fixed top. Transparent initially, solid background on scroll (white in light, navy in dark).

| Left | Right |
|------|-------|
| BitByBit Arena logo (small block icon + text) | "Sign In with Nostr" button (purple solid, white text) |

**Behavior:**
- On scroll: Background fades in, subtle bottom border appears (1px, 8% opacity)
- Mobile: Logo icon only, compact sign in button
- No nav links, no hamburger — just logo + sign in
- Sign In opens a modal with NIP-07 flow

**Logo:** The "BitByBit" text with a small 3-block stack icon to the left (like a mini tower of purple, gold, green blocks).

### 2. Hero

Full viewport height. **Always dark** (even in light mode). Dramatic, high-stakes.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░  "Built on Nostr" badge              ░░░░░░░░░  │
│  ░░                             ·  ·  ·  ░░░░░░░░░  │
│  ░░  Enter the Arena.           ·■■·     ░░░░░░░░░  │
│  ░░  Battle for Sats.          ·■■■■·    ░░░░░░░░░  │
│  ░░                             ████     ░░░░░░░░░  │
│  ░░  Subtitle text...           ██       ░░░░░░░░░  │
│  ░░                             ██       ░░░░░░░░░  │
│  ░░  [Explore the Arena] [→]   ■■       ░░░░░░░░░  │
│  ░░                          (pixel sword)░░░░░░░░  │
│  ░░░ · · · · arena floor grid · · · · · ░░░░░░░░░  │
│  ▓▓▓▓▓▓ pixel dissolve into next section ▓▓▓▓▓▓▓▓  │
└──────────────────────────────────────────────────────┘
```

**Content:**
- Manifesto: "What if anyone could challenge anyone, and the victories lived on Nostr forever?" — Italic, secondary text color, displayed as a quiet question above the headline. Not a pill/badge — a full sentence that sets the philosophical tone before the action headline
- Headline: "Enter the Arena." — Large, bold, purple with subtle text-shadow glow. Below it, "BATTLE FOR SATS" in gold, smaller (0.5em), uppercase, tracked wide — a battle cry tagline, not a second headline
- Subtitle: "The open arena where anyone can create challenges, compete for sats, and earn badges on their Nostr identity."
- CTAs: "Explore the Arena" (purple solid button with subtle glow) + "Launch a Challenge" (outline button, light border)

**Visual Elements:**
- **Pixel weapon** (right side): A pixel sword/flag assembled from blocks with drop-bounce animation. Lit from below by the spotlight glow. Each block drops in to "forge" the weapon
- **Arena floor grid**: Sparse dot grid at 2-4% opacity, masked to fade at edges. Suggests the arena ground
- **Shadow blocks**: 6-8 blocks at 3-10% opacity scattered at edges, some partially off-screen. They drift very slowly
- **Spotlight**: 1-2 radial gradients (purple primary, gold secondary) creating the arena lighting effect
- **Pixel dissolve**: Bottom edge of hero dissolves into scattered blocks that transition to the next section

**Animations:**
- Staggered entrance: badge → headline → subtitle → CTAs (fadeInUp, 0.15s intervals)
- Pixel weapon assembles after text appears (0.6s delay, blocks drop one by one at 250ms intervals)
- Shadow blocks fade in at different times (1-2s, staggered)
- Spotlight subtly pulses (very slow, 8s cycle, 2% opacity change — almost imperceptible but adds life)
- Desktop: Parallax on scroll (shadow blocks and weapon move at different speeds)

**Mobile:**
- Pixel weapon above the text (centered, smaller blocks 32px)
- Fewer shadow blocks (3-4)
- Spotlight simpler (single gradient)
- Arena floor grid hidden on mobile (too subtle at small sizes)

### 3. How It Works

Three steps with connecting pixel trail. Still on dark background (transition from hero).

**Steps:**

| # | Title | Description | Pixel Icon |
|---|-------|-------------|------------|
| 1 | **Create** | Set the rules, duration, and fund it with sats. Your arena awaits challengers. | Pixel flag (purple blocks) |
| 2 | **Battle** | Enter challenges, submit your proof of victory, and track your progress. | Pixel shield (green blocks) |
| 3 | **Earn** | Conquer challenges to earn NIP-58 badges. Your victories live on Nostr. | Pixel trophy (gold blocks) |

**Layout (desktop):** Three cards in a row connected by a **pixel trail** — small blocks (8px) scattered between cards like a path across the arena floor. The trail animates in block by block.

```
  [Card 1] ■ · ■ · · ■ [Card 2] · ■ · ■ · · ■ [Card 3]
```

**Layout (mobile):** Vertical stack, pixel trail runs down the left edge between cards.

**Card styling:**
- Dark surface background with subtle border (arena wall feel)
- Left border accent (4px, colored per step: purple, green, gold)
- Pixel icon in the top-right corner of each card (3x3 or 4x4 block grid forming the icon)
- Number badge: block-shaped (square, rounded corners, colored fill, white number)
- Hover: lift + colored shadow from spotlight + block confetti sparks

**Animation:**
- Cards appear via `scroll-reveal-stagger`
- Pixel trail animates block by block (scatter in from random directions, 50ms per block)
- Number badges do a mini "drop" animation when entering view
- Pixel icons assemble on scroll-reveal (blocks appear one by one)

### 4. About BitByBit

This section marks the transition to lighter background. Pixel dissolve at the top edge.

**Content:**
- Title: "Part of the BitByBit Ecosystem"
- Text: "BitByBit started as a habit tracker that rewards kids with real sats for completing tasks. Now we're taking the same idea — real rewards for real effort — and built an arena on Nostr."
- Two comparison cards with a **pixel "VS"** between them:

| BitByBit Habits | BitByBit Arena |
|-----------------|---------------------|
| Private, family-focused | Public, competitive |
| Daily routines | Time-bounded battles |
| Sponsor rewards kid | The arena crowns champions |
| [Visit bitbybit.com.ar →] | You're here |

**Visual:**
- Cards have a colored top border (habits = gold, arena = purple)
- Between the cards: a **pixel-art "VS"** built from red blocks (3x5 block grid). On mobile it sits between the stacked cards
- A few shadow blocks at the edges (continuing the depth effect)
- The Arena card has a subtle purple spotlight glow behind it (radial gradient, 4% opacity)

### 5. Partners

**Layout:** Centered row of partner logos. Light background, clean.

| Partner | Logo |
|---------|------|
| **La Crypta** | Logo from their branding |
| **Nostr WoT** | Web of Trust logo |

**Visual:**
- Title: "Partners" (simple, centered)
- Logos displayed at ~48px height, with generous spacing
- Grayscale by default → full color on hover (CSS `filter: grayscale(1)` → `grayscale(0)`)
- Each logo sits on a subtle card (surface bg, light border)
- Small pixel-art handshake icon (block-built) beside the title

### 6. Support the Project

**Content:**
- Title: "Support BitByBit"
- Subtitle: "Open source and community-driven. Help us keep building."
- Two action areas:

| Donate Sats | Contribute Code |
|------------|-----------------|
| Lightning address display | GitHub repo link |
| Copy button + QR expand | "Star on GitHub" + "Open Issues" |
| Zap button (if WebLN available) | |

**Visual:**
- Slightly different background (surface color)
- Pixel-art lightning bolt (gold blocks, 4x7 grid) beside the donate card — gently pulsing
- Scattered shadow blocks at edges (sparse, low opacity)
- The donation card has a gold left border accent
- QR code styled cleanly with rounded container

### 7. Footer

**Content:**
- Left: "Built for Hackathon #2 de La Crypta" + La Crypta logo
- Center: BitByBit logo (small block stack)
- Right: Links — GitHub, Nostr, BitByBit Habits
- Bottom: "Made by BitByBit" in small text

**Visual:**
- Subtle top border (1px, 8% opacity)
- Surface background color
- Compact, not too tall
- No bubbles in footer — clean and grounded

---

## Animation Inventory

### Reused from Habits (adapted)
| Animation | Where | Changes |
|-----------|-------|---------|
| `fadeInUp` | Staggered section entrances | Same |
| `scroll-reveal` | All sections | Same intersection observer approach |
| `block-drop` | Hero pixel weapon, step numbers | Larger, slower, more dramatic |
| `block-fade` | Weapon completion | Same concept |
| `dotBounce` | Loading states | Same |

### New for Arena
| Animation | Where | Description |
|-----------|-------|-------------|
| `block-forge` | Hero pixel weapon | Blocks assemble one by one to build the weapon shape |
| `block-scatter` | How It Works connectors | Blocks fly in from random directions to form the pixel trail |
| `block-pulse` | Hero weapon (after build) | Gentle opacity/scale pulse, simulates glowing in spotlight |
| `block-confetti` | Card/CTA hover | Tiny blocks burst outward like pixel sparks (300ms) |
| `block-drift` | Shadow blocks | Very slow movement (20s cycle), blocks drift at section edges |
| `pixel-dissolve` | Section transitions | Blocks scatter along boundary, denser in middle |
| `pixel-assemble` | Pixel-art icons | Icon blocks appear one by one on scroll-reveal |
| `spotlight-pulse` | Hero background | Radial gradient opacity shifts (8s, 2% change) |
| `color-fill` | Progress blocks | Blocks fill left-to-right with color |
| `grayscale-reveal` | Partner logos | Filter transition on hover |
| `parallax-scroll` | Shadow blocks + weapon | Different scroll speeds via CSS transform |

### Reduced Motion
All animations collapse to static states:
```scss
@media (prefers-reduced-motion: reduce) {
  .block-decorative, .shadow-block { animation: none; }
  .scroll-reveal { opacity: 1; transform: none; }
  .spotlight { animation: none; }
  .pixel-dissolve { opacity: 1; }
}
```

---

## Component Breakdown

```
components/
  common/
    Block/                     <- Reusable block element
      index.tsx
      block.module.scss
    BlockTower/                <- Animated stacking tower (loader)
      index.tsx
      block-tower.module.scss
    PixelIcon/                 <- Pixel-art icons built from blocks
      index.tsx
      pixel-icon.module.scss
    PixelDissolve/             <- Section transition dissolve effect
      index.tsx
      pixel-dissolve.module.scss
    ArenaFloor/                <- Sparse grid background pattern
      index.tsx
      arena-floor.module.scss
  landing/
    Hero/
      index.tsx
      hero.module.scss
    HowItWorks/
      index.tsx
      how-it-works.module.scss
    About/
      index.tsx
      about.module.scss
    Partners/
      index.tsx
      partners.module.scss
    Support/
      index.tsx
      support.module.scss
  layout/
    Navbar/
      index.tsx
      navbar.module.scss
    Footer/
      index.tsx
      footer.module.scss
    NostrLoginModal/
      index.tsx
      nostr-login-modal.module.scss
```

---

## Mobile Considerations

- Hero: Pixel weapon above text (centered), smaller blocks (32px), single spotlight
- How It Works: Vertical layout, pixel trail runs down left edge
- About: Cards stack vertically, pixel VS between them
- Partners: Logos wrap or shrink
- Support: Single column, QR below text
- Navbar: Logo icon only, compact button
- Arena floor grid: Hidden on mobile (too subtle)
- Shadow blocks: Reduced to 3-4 per section, lower opacity
- Pixel dissolve transitions: Simpler (fewer blocks, less dense)
- Safe-area-inset padding for iPhone notch
