# Product Vision

## One-liner

aA Nostr-native challenge platform — create challenges, compete with others, earn badges that live on your Nostr identity.

## Problem

Social media incentivizes passive consumption. There's no decentralized platform where people can challenge each other to do things in the real world and get rewarded for it.

## Solution

BitByBit Arena is a Nostr-native app that makes challenges social, verifiable, and rewarding:

- **Create** a challenge with rules, duration, and verification method
- **Join** challenges that interest you
- **Prove** completion with a text description
- **Earn** NIP-58 badges tied to your Nostr identity
- **Zap** impressive completions (optional, community-driven)
- **Share** everything to Nostr — your activity is visible across the network

## Target Users

- Nostr users who want gamified social experiences
- Communities running group challenges (fitness, learning, creative)
- Challenge creators who want to incentivize participation with sats

## User Stories

### As a Challenge Creator
- I can create a challenge with a title, description, rules, and duration
- I can set a verification method (my approval, community vote, automatic)
- I can design a custom badge for completers
- When I create a challenge, it's published to Nostr so my followers see it

### As a Participant
- I can browse open challenges and filter by category/prize/duration
- I can join a challenge with one click
- I can submit text proof of completion
- I receive a badge (NIP-58) when I complete the challenge — it's part of my Nostr identity
- My completions are published to Nostr so my followers see them

## Challenge Types (MVP scope marked with *)

- **One-time challenge*** — Complete once to earn badge/prize (e.g., "Climb this mountain")
- **Streak challenge*** — Complete daily for N days (e.g., "30 days of meditation")
- **Competition*** — Most points/completions in a time window wins (e.g., "Most books read in March")
- **Race** — First N to complete win the prize (e.g., "First 3 to run a 5K")
- **Creative** — Best submission voted by community (e.g., "Best sunset photo")

## UX Priorities

**Simplicity is critical.** The judges are bots that evaluate UI clarity. Every screen must be self-explanatory.

- 2 tabs only (Explore, My Challenges), minimal navigation depth
- Challenge cards show all key info at a glance (title, participants, time left, badge)
- Join/submit/verify flows take minimal taps
- Progress is always visible (progress bars, countdowns, participant count)
- Empty states guide the user to action

## Relationship with BitByBit Habits

BitByBit Habits is a private, family-focused habit tracker (sponsor creates habits for kids). BitByBit Arena is public and competitive — anyone can create/join challenges on the open Nostr network.

They share:
- The BitByBit brand and organization
- The same tech stack and code quality standards
- The philosophy of rewarding real-world actions

They differ in:
- **Habits** = private, family, ongoing routines, sponsor-kid relationship
- **Arena** = public, competitive, time-bounded battles, peer-to-peer
