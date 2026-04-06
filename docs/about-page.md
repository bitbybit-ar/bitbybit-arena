# About Page

## Overview

Public page at `/about`. Tells the story of BitByBit, introduces the team, and connects both projects (Habits + Challenges). No auth required.

## Sections

### 1. Project Story

**Title:** "The BitByBit Story"

Content (adapt to both languages):

BitByBit started during the FOUNDATIONS hackathon by La Crypta in March 2026. The idea was simple: what if kids could earn real bitcoin for building good habits? That became **BitByBit Habits** — a family habit tracker where sponsors reward kids with sats via Lightning Network.

The name "BitByBit" reflects the philosophy: small consistent actions, stacked over time, create big results. Like stacking sats, like building blocks.

For the second La Crypta hackathon (Nostr theme), we took the same idea — real rewards for real effort — and brought it to the open Nostr network. **BitByBit Challenges** lets anyone create public challenges, compete with others, and earn badges and sats. No families, no permissions — just the open protocol.

Both projects share the same codebase quality, the same team, and the same belief: Bitcoin should reward action, not just speculation.

**Visual:** Block tower animation beside the text (subtle, decorative). A few bubbles around the section.

### 2. The Two Projects

Side-by-side comparison (similar to the About section on landing, but more detailed).

| | BitByBit Habits | BitByBit Challenges |
|--|-----------------|---------------------|
| **Hackathon** | FOUNDATIONS (#1) — Lightning | Hackathon #2 — Nostr |
| **Theme** | Private, family | Public, social |
| **Auth** | Email/password + Nostr | Nostr only |
| **Users** | Sponsors + Kids | Any Nostr identity |
| **Rewards** | Sponsor pays kid via NWC | Creator funds prize, community zaps |
| **Data** | Private database | Public Nostr events + DB cache |
| **Status** | v1.0.0 released | In development |
| **Link** | [bitbybit.com.ar](https://bitbybit.com.ar) | You're here |

### 3. The Team

**Title:** "Who We Are"

| Member | Role | Short Bio | Links |
|--------|------|-----------|-------|
| **Anix** | Lead Dev | Full-stack developer. Designed the architecture and wrote most of the code for both projects. | GitHub, Nostr |
| **Llopo** | Dev | Developer contributing to backend and Lightning integration. | GitHub, Nostr |
| **Wander** | Dev / UX | Developer and UX. Worked on the user experience and frontend. | GitHub, Nostr |
| **Leon** | PM | Project manager. Keeps the team on track and coordinates hackathon deliverables. | GitHub, Nostr |

**Visual per member:**
- Avatar (from GitHub or Nostr profile picture)
- Name + role badge (colored pill)
- One-line bio
- Links as small icons (GitHub, Nostr)
- Card with subtle hover effect

**Layout:** Grid of 4 cards. 2x2 on desktop, single column on mobile.

### 4. La Crypta & Hackathons

Brief section acknowledging La Crypta as the community that made this possible.

- La Crypta logo
- "Both BitByBit projects were born at La Crypta hackathons — a Bitcoin community in Argentina that organizes events to build on Lightning and Nostr."
- Link to [hackaton.lacrypta.ar](https://hackaton.lacrypta.ar)

### 5. Open Source

- "BitByBit is fully open source. All code is public on GitHub."
- Links to both repos
- Invitation to contribute or open issues

---

## Page Layout

```
┌─────────────────────────────────────────┐
│  Navbar                                 │
├─────────────────────────────────────────┤
│                                         │
│  The BitByBit Story            ○        │
│  [narrative text]          ○            │
│                    ■                    │
│                   ■ ■                   │
│                  ■ ■ ■                  │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  Two Projects                           │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Habits     │  │ Challenges  │      │
│  │  ...        │  │ ...         │      │
│  └─────────────┘  └─────────────┘      │
│                                         │
├─────────────────────────────────────────┤
│                                    ○    │
│  Who We Are                            │
│  ┌──────┐ ┌──────┐                     │
│  │ Anix │ │Llopo │                     │
│  └──────┘ └──────┘                     │
│  ┌──────┐ ┌──────┐                     │
│  │Wander│ │ Leon │                     │
│  └──────┘ └──────┘                     │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  La Crypta & Open Source         ○      │
│  [logos + links]                        │
│                                         │
├─────────────────────────────────────────┤
│  Footer                                 │
└─────────────────────────────────────────┘
```

---

## Navigation

- Linked from the landing page (About section "Learn more" link)
- Linked from the footer
- Linked from Navbar (add "About" link when we add more nav items post-MVP)

---

## i18n Keys Needed

```
about.story.title
about.story.content (can be multiple paragraphs)
about.projects.title
about.projects.habits.*
about.projects.challenges.*
about.team.title
about.team.members.anix.* (name, role, bio)
about.team.members.llopo.*
about.team.members.wander.*
about.team.members.leon.*
about.lacrypta.title
about.lacrypta.description
about.openSource.title
about.openSource.description
```

---

## Implementation Notes

- Server component (no client interactivity needed, just content)
- Scroll reveal animations on each section
- Decorative bubbles and blocks scattered throughout
- Team member avatars loaded from GitHub (`https://github.com/<username>.png`)
- Responsive: cards stack on mobile
