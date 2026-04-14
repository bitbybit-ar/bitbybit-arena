import type { BlossomDescriptor } from "./blossom";
import type { NostrMetadata, UnsignedNostrEvent } from "./types";

/**
 * Build a plain kind:1 short text note (NIP-01). Used by the
 * "Share on Nostr" popup to publish a free-form shout with no e/p/imeta
 * tagging — the content is whatever the user typed.
 */
export function buildNoteEvent(content: string): UnsignedNostrEvent {
  return {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content,
  };
}

/**
 * Build a Profile Metadata event (kind 0, NIP-01).
 * Callers should merge their edits on top of the latest kind:0 fetched
 * from relays so unknown fields (nip05, website, etc.) are preserved.
 */
export function buildProfileMetadataEvent(
  metadata: NostrMetadata
): UnsignedNostrEvent {
  return {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(metadata),
  };
}

/**
 * Build a Challenge Definition event (kind 30100).
 * Parameterized replaceable — the `d` tag is the challenge slug.
 */
export function buildChallengeEvent(params: {
  slug: string;
  title: string;
  description: string;
  type: string;
  tags?: string[];
  goal?: number;
  unit?: string;
  verification: string[];
  badgeName?: string;
  badgeImageUrl?: string;
  startsAt?: string;
  endsAt?: string;
}): UnsignedNostrEvent {
  const tags: string[][] = [
    ["d", params.slug],
    ["title", params.title],
    ["type", params.type],
    ["status", "open"],
  ];

  for (const method of params.verification) {
    tags.push(["verification", method]);
  }
  if (params.tags) {
    for (const t of params.tags) tags.push(["t", t]);
  }
  if (params.goal) tags.push(["goal", String(params.goal)]);
  if (params.unit) tags.push(["unit", params.unit]);
  if (params.badgeName) tags.push(["badge", params.badgeName]);
  if (params.badgeImageUrl) tags.push(["badge_image", params.badgeImageUrl]);
  if (params.startsAt) tags.push(["start", String(Math.floor(new Date(params.startsAt).getTime() / 1000))]);
  if (params.endsAt) tags.push(["end", String(Math.floor(new Date(params.endsAt).getTime() / 1000))]);

  return {
    kind: 30100,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: params.description,
  };
}

/**
 * Build a Challenge Join event (kind 7100).
 */
export function buildJoinEvent(creatorPubkey: string, challengeSlug: string): UnsignedNostrEvent {
  return {
    kind: 7100,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["a", `30100:${creatorPubkey}:${challengeSlug}`],
      ["p", creatorPubkey],
    ],
    content: "",
  };
}

/**
 * Build a Completion Submission event (kind 7101).
 *
 * When `imageDescriptor` is provided, the URL is appended to the content on
 * its own line (Nostr clients render a bare image URL as an inline preview)
 * and mirrored as an `imeta` tag (NIP-92) so strict clients see the
 * attachment too. Any known metadata on the descriptor — mime type, sha256,
 * byte size — is folded into the same imeta tag as extra space-separated
 * key/value pairs. Unknown/missing fields are simply omitted. `dim` (WxH)
 * would require a client-side image decode and is deliberately not emitted
 * here.
 */
export function buildCompletionEvent(params: {
  creatorPubkey: string;
  challengeSlug: string;
  content: string;
  imageDescriptor?: { url: string } & Partial<
    Pick<BlossomDescriptor, "sha256" | "size" | "type">
  >;
  step?: number;
  progress?: number;
  goal?: number;
}): UnsignedNostrEvent {
  const tags: string[][] = [
    ["a", `30100:${params.creatorPubkey}:${params.challengeSlug}`],
    ["p", params.creatorPubkey],
  ];

  if (params.step) tags.push(["step", String(params.step)]);
  if (params.progress !== undefined && params.goal) {
    tags.push(["progress", String(params.progress), String(params.goal)]);
  }
  const imageUrl = params.imageDescriptor?.url;
  if (imageUrl) {
    const imeta = ["imeta", `url ${imageUrl}`];
    if (params.imageDescriptor?.type) {
      imeta.push(`m ${params.imageDescriptor.type}`);
    }
    if (params.imageDescriptor?.sha256) {
      imeta.push(`x ${params.imageDescriptor.sha256}`);
    }
    if (params.imageDescriptor?.size !== undefined) {
      imeta.push(`size ${params.imageDescriptor.size}`);
    }
    tags.push(imeta);
  }

  const content = imageUrl
    ? `${params.content}\n\n${imageUrl}`
    : params.content;

  return {
    kind: 7101,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
}

/**
 * Build a Badge Definition event (kind 30009, NIP-58).
 *
 * Parameterized replaceable — the `d` tag is the badge's unique identifier
 * (we use the challenge slug, which is already unique per creator). A
 * creator publishes one definition per challenge; the corresponding
 * Badge Award events (kind 8) `a`-tag this event.
 */
export function buildBadgeDefinitionEvent(params: {
  slug: string;
  name: string;
  description?: string;
  image?: string;
  thumb?: string;
}): UnsignedNostrEvent {
  const tags: string[][] = [
    ["d", params.slug],
    ["name", params.name],
  ];
  if (params.description) tags.push(["description", params.description]);
  if (params.image) tags.push(["image", params.image]);
  if (params.thumb) tags.push(["thumb", params.thumb]);
  return {
    kind: 30009,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}

/**
 * Build a Badge Award event (kind 8, NIP-58).
 *
 * MUST `a`-tag the `kind:30009` Badge Definition it awards. Previously this
 * function pointed at our `kind:30100` challenge event, which isn't a
 * NIP-58 badge definition — so wallets like Amethyst / Coracle wouldn't
 * render it as a badge. Use `buildBadgeDefinitionEvent` first to publish
 * the definition, then pass that definition's `d` tag + issuer pubkey here.
 */
export function buildBadgeAwardEvent(params: {
  badgeDefinitionSlug: string;
  issuerPubkey: string;
  recipientPubkey: string;
}): UnsignedNostrEvent {
  return {
    kind: 8,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["a", `30009:${params.issuerPubkey}:${params.badgeDefinitionSlug}`],
      ["p", params.recipientPubkey],
    ],
    content: "",
  };
}

/**
 * Build a Profile Badges event (kind 30008, NIP-58).
 *
 * Parameterized replaceable with `d=profile_badges` — one per user. The
 * event carries pairs of `a` + `e` tags (definition + award) for each
 * badge the user wants to display on their public profile. Callers should
 * fetch the user's latest 30008 first and merge the new pair in so prior
 * accepted badges are preserved.
 */
export interface ProfileBadgePair {
  /** `30009:<issuer>:<d>` — a-tag referencing the badge definition */
  definitionATag: string;
  /** Event id of the kind:8 award event */
  awardEventId: string;
}

export function buildProfileBadgesEvent(
  pairs: ProfileBadgePair[]
): UnsignedNostrEvent {
  const tags: string[][] = [["d", "profile_badges"]];
  for (const pair of pairs) {
    tags.push(["a", pair.definitionATag]);
    tags.push(["e", pair.awardEventId]);
  }
  return {
    kind: 30008,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}

/**
 * Parse a signed kind:30008 event back into a list of (a, e) pairs. Used
 * when merging an "Accept badge" click with the user's existing profile
 * badges so we don't drop previously accepted ones.
 */
export function parseProfileBadgesPairs(event: {
  tags: string[][];
}): ProfileBadgePair[] {
  const pairs: ProfileBadgePair[] = [];
  for (let i = 0; i < event.tags.length; i++) {
    const tag = event.tags[i];
    if (tag[0] === "a" && tag[1]?.startsWith("30009:")) {
      const next = event.tags[i + 1];
      if (next && next[0] === "e" && typeof next[1] === "string") {
        pairs.push({ definitionATag: tag[1], awardEventId: next[1] });
        i++;
      }
    }
  }
  return pairs;
}

/**
 * Build a Zap Goal event (kind 9041, NIP-75).
 * Published by the challenge creator to declare a funding goal for the
 * prize pot. Supporters can zap the goal event directly; the client
 * aggregates the incoming zap receipts to show real-time funding.
 */
export function buildZapGoalEvent(params: {
  challengeSlug: string;
  creatorPubkey: string;
  amountSats: number;
  title: string;
  relays: string[];
  closedAt?: string;
}): UnsignedNostrEvent {
  const tags: string[][] = [
    ["amount", String(params.amountSats * 1000)], // millisats per NIP-75
    ["relays", ...params.relays],
    ["a", `30100:${params.creatorPubkey}:${params.challengeSlug}`],
  ];
  if (params.closedAt) {
    tags.push([
      "closed_at",
      String(Math.floor(new Date(params.closedAt).getTime() / 1000)),
    ]);
  }
  return {
    kind: 9041,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: params.title,
  };
}

/**
 * Build a Zap Request event (kind 9734, NIP-57).
 * The sender's wallet will use this to pay the recipient.
 */
export function buildZapRequestEvent(params: {
  recipientPubkey: string;
  eventId: string;
  amount: number;
  relays: string[];
  comment?: string;
}): UnsignedNostrEvent {
  return {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", params.recipientPubkey],
      ["e", params.eventId],
      ["amount", String(params.amount * 1000)], // millisats
      ["relays", ...params.relays],
    ],
    content: params.comment || "",
  };
}

/**
 * English ordinal label for a 0-indexed winner position. Used as the
 * `place` field on `winner` tags in `kind:30101` Challenge Result events.
 *
 * Intentionally not translated — the label is part of a Nostr event
 * consumed by third-party clients (njump, Coracle, Amethyst), not an
 * Arena UI string. The 11/12/13 special case lives here so callers can't
 * accidentally generate "11st", "12nd", "13rd".
 */
export function placeLabel(index: number): string {
  const n = index + 1;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * Build a Challenge Result event (kind 30101).
 *
 * Parameterized replaceable — the `d` tag is `<challenge-slug>:results`, so
 * there is one result event per challenge per creator. Published by the
 * creator once the reward payout flow completes, summarising winners and
 * aggregate stats.
 *
 * Custom BitByBit kind. The `a` tag references the kind:30100 challenge
 * definition so clients can resolve result → challenge without a second
 * database hop.
 *
 * Shape:
 * - `["d", "<slug>:results"]`
 * - `["a", "30100:<creatorPubkey>:<slug>"]`
 * - `["winner", "<pubkey>", "<place>", "<amount>"]` — one per paid winner
 * - `["completer", "<pubkey>"]` — one per user who completed but didn't win
 * - `["stats", "participants:<N>", "completions:<M>", "total_sats:<X>"]`
 */
export interface ChallengeResultWinner {
  pubkey: string;
  /** Human-readable place: "1st", "2nd", "3rd", or `${n}th` for split mode. */
  place: string;
  amountSats: number;
}

export function buildChallengeResultEvent(params: {
  slug: string;
  creatorPubkey: string;
  content?: string;
  winners: ChallengeResultWinner[];
  completerPubkeys: string[];
  stats: {
    participants: number;
    completions: number;
    totalSats: number;
  };
}): UnsignedNostrEvent {
  const tags: string[][] = [
    ["d", `${params.slug}:results`],
    ["a", `30100:${params.creatorPubkey}:${params.slug}`],
  ];

  for (const winner of params.winners) {
    tags.push([
      "winner",
      winner.pubkey,
      winner.place,
      String(winner.amountSats),
    ]);
  }

  // Completers are paying participants who completed but didn't make the
  // winner list (e.g. a tiered challenge's 4th-place finisher). Skip any
  // completer that also appears in the winner list to avoid double-counting.
  const winnerSet = new Set(params.winners.map((w) => w.pubkey));
  for (const pubkey of params.completerPubkeys) {
    if (!winnerSet.has(pubkey)) {
      tags.push(["completer", pubkey]);
    }
  }

  tags.push([
    "stats",
    `participants:${params.stats.participants}`,
    `completions:${params.stats.completions}`,
    `total_sats:${params.stats.totalSats}`,
  ]);

  return {
    kind: 30101,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: params.content ?? "",
  };
}
