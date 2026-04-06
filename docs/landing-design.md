# Landing Page Design

## Structure

```
┌─────────────────────────────────────────┐
│  Navbar                                 │
│  [Logo]                    [Sign In]    │
├─────────────────────────────────────────┤
│                                         │
│  Hero                           ○  ○   │
│  Big headline + tagline + CTA    ○     │
│  Block tower animation      ○          │
│                                         │
├──────────────────────○──────────────────┤
│                                         │
│  How It Works              ○            │
│  3 steps: Create → Compete → Earn      │
│       ○                                 │
├─────────────────────────────────────────┤
│                                    ○    │
│  About BitByBit                        │
│  Brief org story + link to Habits      │
│         ○                               │
├─────────────────────────────────────────┤
│                                         │
│  Partners                    ○          │
│  La Crypta + Nostr WoT logos           │
│                                         │
├────────○────────────────────────────────┤
│                                         │
│  Support the Project                   │
│  Donate via Lightning + contribute     │
│                              ○          │
├─────────────────────────────────────────┤
│  Footer                                 │
│  Built for Hackathon #2 + La Crypta    │
└─────────────────────────────────────────┘

○ = decorative bubbles (float across section boundaries)
```

---

## Design Philosophy: No Glassmorphism

Glassmorphism is overused in AI-generated designs. BitByBit Challenges needs its own visual identity.

### The Two Signature Elements

**1. Bubbles** — Floating circles of varying sizes that break the grid, cross section boundaries, and give the page a playful, organic feel. Some are purely decorative (color fills, gradients, semi-transparent), others contain icons or small illustrations relevant to the nearby section.

**2. Blocks** — The stacking block motif from the BitByBit loader, evolved into a full design element. Blocks aren't just for loading — they represent building, progress, stacking wins. Used as decorative elements, section dividers, progress indicators, and interactive hover effects.

### Why This Works
- **Bubbles** = organic, playful, unexpected. They float, overlap sections, and make the page feel alive — not rigid
- **Blocks** = structured, branded, satisfying. They stack, drop, build — reinforcing the "bit by bit" message
- **Together** = contrast between organic (bubbles) and geometric (blocks) creates visual tension and memorability

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

## Bubble System

### What Are Bubbles?

Circles of varying sizes (24px to 120px) that float around the page. They exist in a layer between the background and content, breaking the rigid section grid.

### Bubble Types

**1. Color Bubbles (most common)**
Solid or semi-transparent circles filled with one of the four accent colors at low opacity (10-20%). They're purely decorative.

```
Light theme: rgba($purple, 0.08)  — soft purple tint
Dark theme:  rgba($purple, 0.12)  — slightly stronger on dark bg
```

**2. Gradient Bubbles**
Circles with a two-color gradient fill (e.g., purple→gold, green→gold). Used sparingly for emphasis near important elements.

**3. Icon Bubbles**
Circles containing a small SVG icon. The bubble acts as a frame for the icon. Used near relevant sections:
- Hero: Lightning bolt bubble, trophy bubble
- How It Works: Camera bubble (proof), badge bubble (rewards)
- Support: Heart bubble, zap bubble

**4. Block Bubbles (hybrid)**
Circles that contain a small block or pixel pattern inside — bridging the two visual systems. Like a bubble with a 2x2 or 3x3 pixel grid inside it.

### Bubble Behavior

**Placement:**
- Positioned absolutely within each section, but intentionally crossing section boundaries (negative margins, overflow visible)
- Distributed asymmetrically — never centered, never evenly spaced
- Larger bubbles toward edges, smaller ones closer to content
- Some peek in from off-screen (partially visible)

**Animation:**
- `bubble-float`: Gentle vertical drift (10-20px) over 6-10s, infinite, different timing per bubble
- `bubble-drift`: Slow horizontal movement for some bubbles (adds life)
- Parallax on scroll: Bubbles move at different speeds than content (CSS `will-change: transform` with scroll-driven animation or simple JS)
- On hover (desktop): Nearby bubbles subtly push away from cursor (optional, interaction delight)

```scss
@keyframes bubble-float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-15px) rotate(3deg); }
}

@keyframes bubble-drift {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(10px); }
}
```

**Responsiveness:**
- Desktop: 8-12 bubbles visible at a time across the page
- Tablet: 5-8 bubbles, slightly smaller
- Mobile: 3-5 bubbles, smaller sizes, less movement
- `prefers-reduced-motion`: Static bubbles, no animation

### Bubble Component

```tsx
interface BubbleProps {
  size: number;           // px diameter
  color: 'purple' | 'gold' | 'green' | 'red';
  variant: 'solid' | 'gradient' | 'icon' | 'block';
  icon?: React.ReactNode; // for icon variant
  opacity?: number;       // 0-1, default 0.1
  position: { top?: string; left?: string; right?: string; bottom?: string };
  animation?: 'float' | 'drift' | 'float-drift' | 'none';
  delay?: number;         // animation delay in seconds
}
```

---

## Block System (Evolved from Loader)

### The BlockLoader DNA

The habits BlockLoader stacks colored squares (52px) with a drop-in bounce animation, glass highlights, and a colored glow underneath. We keep the soul but evolve it:

### What Changes

| Aspect | Habits Loader | Challenges Design System |
|--------|---------------|--------------------------|
| **Context** | Loading indicator only | Full design element (decorative, interactive, structural) |
| **Glass effect** | Glass highlight on each block | Solid fill with subtle inner shadow (no glass) |
| **Glow** | Blurred ellipse under tower | Colored shadow that matches block color |
| **Colors** | 5 colors, random shuffle | 4 colors (purple, gold, green, red), contextual assignment |
| **Sizes** | Fixed 52px | Variable: 16px (tiny), 32px (small), 48px (medium), 64px (large) |
| **Animation** | Drop-in + fade cycle | Multiple: drop, stack, scatter, pulse, assemble |

### Block Uses on the Landing

**1. Hero Block Tower (signature animation)**
A small tower of 4-5 blocks stacks in the hero, similar to the loader but larger and more dramatic. Each block drops in with the familiar bounce, but instead of cycling, the tower stays and the blocks gently pulse with color. The tower sits to the side of the hero text.

**2. Section Divider Blocks**
Between sections, a row of small blocks (16px) arranged in a pattern acts as a visual divider. They can form a dotted line, a wave, or a scattered pixel pattern.

```
  ■ ■     ■
■     ■ ■   ■ ■
        ■       ■
```

**3. Decorative Scattered Blocks**
Small blocks (16-32px) scattered near section edges, similar to how bubbles float. They use the same 4 colors. Some rotate slightly on hover. They complement the bubbles — blocks are geometric and angular, bubbles are round and organic.

**4. Interactive Block Hover**
When hovering over cards or interactive elements, tiny blocks (8-16px) briefly appear and scatter outward from the hover point, like confetti pixels. Subtle, fast (300ms), delightful.

**5. Progress Blocks**
In challenge cards, progress is shown as a row of blocks filling left-to-right instead of a traditional progress bar:

```
[■][■][■][■][■][□][□][□][□][□]  5/10 completed
 G   G   P   R   G                (colored per completion)
```

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
| BitByBit Challenges logo (small block icon + text) | "Sign In with Nostr" button (purple solid, white text) |

**Behavior:**
- On scroll: Background fades in, subtle bottom border appears (1px, 8% opacity)
- Mobile: Logo icon only, compact sign in button
- No nav links, no hamburger — just logo + sign in
- Sign In opens a modal with NIP-07 flow

**Logo:** The "BitByBit" text with a small 3-block stack icon to the left (like a mini tower of purple, gold, green blocks).

### 2. Hero

Full viewport height. Clean, bold.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│                                              ○       │
│   "Built on Nostr" badge                  ○          │
│                                                      │
│   Challenge Yourself.               ■                │
│   Earn Sats.                       ■ ■     ○        │
│                                   ■ ■ ■              │
│   Subtitle text here...          ■ ■ ■ ■             │
│                                    (block tower)     │
│   [Explore Challenges] [Create →]                    │
│                                                      │
│        ○                                    ○        │
└──────────────────────────────────────────────────────┘
```

**Content:**
- Eyebrow: "Built on Nostr" pill badge (purple bg, white text, Nostr icon)
- Headline: "Challenge Yourself. Earn Sats." — Large, bold, pure text (no gradient shimmer — keep it clean and readable). Purple on "Challenge", gold on "Sats"
- Subtitle: "Create challenges, compete with others, prove your wins, and earn Bitcoin rewards on the open Nostr network."
- CTAs: "Explore Challenges" (purple solid button) + "Create a Challenge" (outline button with arrow)

**Visual Elements:**
- **Block tower** (right side): 4-5 blocks stacking with the signature drop-bounce animation. Blocks are larger than loader (64px). Each block a different color. Tower builds once on page load, then blocks gently pulse
- **Bubbles**: 4-5 decorative bubbles around the hero at different sizes and opacity levels. Some contain icons (lightning bolt, trophy)
- **No background orbs or blurs** — clean background (white/navy), let the bubbles and blocks provide visual interest

**Animations:**
- Staggered entrance: badge → headline → subtitle → CTAs (fadeInUp, 0.15s intervals)
- Block tower builds after text appears (0.6s delay, then blocks drop one by one at 350ms intervals)
- Bubbles fade in gently (1s, staggered)
- Desktop: Subtle parallax on scroll (blocks and bubbles move at different speeds)

**Mobile:**
- Block tower moves above or below the text (single column)
- Fewer bubbles (2-3)
- Tower uses smaller blocks (48px)

### 3. How It Works

Three steps with connecting visual.

**Steps:**

| # | Title | Description | Visual |
|---|-------|-------------|--------|
| 1 | **Create** | Set rules, duration, and fund with sats. Published to Nostr for anyone to find. | Purple block with flag icon |
| 2 | **Compete** | Join challenges, submit photo proof, track progress. Community verifies. | Green block with camera icon |
| 3 | **Earn** | Complete for NIP-58 badges and Lightning sats. Your wins visible across Nostr. | Gold block with lightning icon |

**Layout (desktop):** Three cards in a row with a connecting line of small scattered blocks between them (not a straight line — a playful pixel trail).

```
  [Card 1] ■ · ■ · · ■ [Card 2] · ■ · ■ · · ■ [Card 3]
```

**Layout (mobile):** Vertical stack, blocks scattered along the left edge between cards.

**Card styling:**
- Solid surface background
- Left border accent (4px, colored per step: purple, green, gold)
- Number badge: block-shaped (square, rounded corners, colored fill, white number)
- Hover: lift + colored shadow matching the step color

**Bubbles:** 2-3 small bubbles near this section, one containing a checkmark icon.

**Animation:**
- Cards appear via `scroll-reveal-stagger`
- Connecting block trail animates piece by piece (scatter in from random directions)
- Number badges do a mini "drop" animation (like the loader) when they enter view

### 4. About BitByBit

**Content:**
- Title: "Part of the BitByBit Ecosystem"
- Text: "BitByBit started as a habit tracker that rewards kids with real sats for completing tasks. Now we're taking the same idea — real rewards for real effort — to the open Nostr network."
- Two comparison cards:

| BitByBit Habits | BitByBit Challenges |
|-----------------|---------------------|
| Private, family-focused | Public, social |
| Daily routines | Time-bounded competitions |
| Sponsor rewards kid | Community rewards everyone |
| [Visit bitbybit.com.ar →] | You're here |

**Visual:**
- Cards have a colored top border (habits = gold, challenges = purple)
- A small block tower decorative element between the cards (3 blocks, static, the "bit by bit" building metaphor)
- 1-2 floating bubbles
- Habits card could show a tiny screenshot or the habits block loader colors

### 5. Partners

**Layout:** Centered row of partner logos.

| Partner | Logo |
|---------|------|
| **La Crypta** | Logo from their branding |
| **Nostr WoT** | Web of Trust logo |

**Visual:**
- Title: "Partners" (simple, centered)
- Logos displayed at ~48px height, with generous spacing
- Grayscale by default → full color on hover (CSS `filter: grayscale(1)` → `grayscale(0)`)
- Each logo sits on a subtle card (surface bg, light border)
- A decorative bubble nearby with a handshake or link icon

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
- Prominent section with slightly different background (very subtle, e.g., surface color)
- Lightning bolt icon bubble (gold, larger, gently pulsing)
- Block decorative elements — a small scattered pixel pattern near edges
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
| `block-drop` | Hero tower, step numbers | Larger, slower, more dramatic |
| `block-fade` | Tower completion cycle | Same concept |
| `dotBounce` | Loading states | Same |

### New for Challenges
| Animation | Where | Description |
|-----------|-------|-------------|
| `bubble-float` | All bubbles | Gentle vertical drift, 6-10s, infinite |
| `bubble-drift` | Some bubbles | Slow horizontal sway combined with float |
| `block-scatter` | How It Works connectors | Blocks fly in from random directions to form the trail |
| `block-pulse` | Hero tower (after build) | Gentle opacity/scale pulse on built tower |
| `block-confetti` | Card hover (interactive) | Tiny blocks burst outward from hover point |
| `color-fill` | Progress blocks | Blocks fill left-to-right with color |
| `grayscale-reveal` | Partner logos | Filter transition on hover |
| `parallax-scroll` | Bubbles + blocks | Different scroll speeds via CSS transform |

### Reduced Motion
All animations collapse to static states:
```scss
@media (prefers-reduced-motion: reduce) {
  .bubble, .block-decorative { animation: none; }
  .scroll-reveal { opacity: 1; transform: none; }
}
```

---

## Component Breakdown

```
components/
  common/
    Bubble/                    <- Reusable bubble element
      index.tsx
      bubble.module.scss
    Block/                     <- Reusable block element
      index.tsx
      block.module.scss
    BlockTower/                <- Animated stacking tower
      index.tsx
      block-tower.module.scss
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

- Hero: Block tower above text (centered), fewer/smaller bubbles
- How It Works: Vertical layout, block trail along left edge
- About: Cards stack vertically
- Partners: Logos wrap or shrink
- Support: Single column, QR below text
- Navbar: Logo icon only, compact button
- Bubbles: Max 3-5 visible at a time, smaller sizes
- Block decorations: Reduced quantity, same visual identity
- Safe-area-inset padding for iPhone notch
