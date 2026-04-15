#2
---

## Part 11 — Walk around in both languages

Quick final pass: switch the language between Spanish and English and scan these pages for anything that looks broken (text not translated, buttons cut off, overlapping layouts):

- The landing page
- The sign-in page (all three sign-in options)
- The Explore page (with a filter active)
- The Create Challenge form (all the fields)
- One challenge detail page, signed in as the Creator
- The same challenge detail page, signed in as the Participant
- My Challenges (all three tabs)
- Settings

Also check on a couple of challenge cards: dates and numbers should be formatted the way you'd expect for the current language (Spanish uses commas for decimals, dot for thousands; English is the opposite).

---

## What you've covered

By the end of this walkthrough you will have touched every major feature of the app:

- **Sign-in** — browser extension, create account, paste secret code, (optional) mobile signer.
- **Profile** — edit, sync from Nostr, publish to Nostr, change theme, change language.
- **Create challenge** — all five challenge types (one-time, streak, competition, race, creative), all four verification methods (creator approval, automatic, Nostr hashtag, Nostr action), sequential and parallel multi-step challenges, prizes, badges, tags, end dates.
- **Explore** — grid, search, filter by type, filter by tag, three sort orders, popular tags, empty state.
- **Challenge detail** — join, leave, rejoin, submit text proof, submit photo proof, complete checkpoints in order, complete checkpoints in any order, automatic approval, creator approval/rejection, edit a challenge, delete a challenge, **creator joins their own challenge with warning**, **creator_approval proofs self-approve for the creator**.
- **Badges** — creator awards a badge, publishes it to Nostr, participant sees it in their Achievements and accepts it to their Nostr profile.
- **Rewards** — creator distributes a Lightning prize; winner-takes-all and tiered split; **retained shares when the creator wins their own prize**.
- **My Challenges** — Joined, Created, and Achievements tabs, each with correct data for each account.

---

## Things to flag to the development team

These are small issues I noticed while planning this walkthrough. You don't need to test them — just mention them back when you're done:

1. The Explore page offers **Newest**, **Ending Soon**, and **Most Participants** as sort options, but the backend also knows how to sort by **"Trending"** (based on recent joins and completions). It would be nice to expose that as a fourth option in the sort menu.
2. The Lightning donation flow on the landing page uses a payment-status checker, but the challenge reward flow doesn't. If a prize payment is slow to settle, there's no automatic "is it paid yet?" polling on the challenge page. Something to consider.
