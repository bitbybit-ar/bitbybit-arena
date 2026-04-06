# Product Vision

## One-liner

A Nostr client where anyone can create challenges, compete with others, and earn badges and sats.

## Problem

Social media incentivizes passive consumption. There's no decentralized platform where people can challenge each other to do things in the real world and get rewarded for it.

## Solution

BitByBit Challenges is a Nostr-native app that makes challenges social, verifiable, and rewarding:

- **Create** a challenge with rules, duration, and optional sat prize
- **Join** challenges that interest you
- **Prove** completion with photo/video evidence
- **Earn** NIP-58 badges and Lightning sats
- **Share** everything to Nostr — your activity is visible across the network

## Target Users

- Nostr users who want gamified social experiences
- Communities running group challenges (fitness, learning, creative)
- Challenge creators who want to incentivize participation with sats

## User Stories

### As a Challenge Creator
- I can create a challenge with a title, description, rules, and duration
- I can set a verification method (my approval, community vote, automatic)
- I can fund a prize pool in sats with distribution rules
- I can design a custom badge for completers
- When I create a challenge, it's published to Nostr so my followers see it

### As a Participant
- I can browse open challenges and filter by category/prize/duration
- I can join a challenge with one click
- I can submit proof of completion (photo, text description)
- I receive a badge when I complete the challenge
- I receive sats if I win a prize
- My completions are published to Nostr so my followers see them

### As a Follower (Feed Consumer)
- I see when people I follow create, join, or complete challenges
- I can zap impressive completions
- I can join challenges I discover in my feed

## Challenge Types (MVP scope marked with *)

- **One-time challenge*** — Complete once to earn badge/prize (e.g., "Climb this mountain")
- **Streak challenge*** — Complete daily for N days (e.g., "30 days of meditation")
- **Competition*** — Most points/completions in a time window wins (e.g., "Most books read in March")
- **Race** — First N to complete win the prize (e.g., "First 3 to run a 5K")
- **Creative** — Best submission voted by community (e.g., "Best sunset photo")

## UX Priorities

**Simplicity is critical.** The judges are bots that evaluate UI clarity. Every screen must be self-explanatory.

- Maximum 3 tabs, minimal navigation depth
- Challenge cards show all key info at a glance (title, prize, participants, time left)
- Join/submit/verify flows take minimal taps
- Progress is always visible (progress bars, countdowns, participant count)
- Empty states guide the user to action

## Relationship with BitByBit Habits

BitByBit Habits is a private, family-focused habit tracker (sponsor creates habits for kids). BitByBit Challenges is public and social — anyone can create/join challenges on the open Nostr network.

They share:
- The BitByBit brand and organization
- The same tech stack and code quality standards
- Lightning Network for payments
- The philosophy of rewarding real-world actions with sats

They differ in:
- **Habits** = private, family, ongoing routines, sponsor-kid relationship
- **Challenges** = public, social, time-bounded competitions, peer-to-peer
