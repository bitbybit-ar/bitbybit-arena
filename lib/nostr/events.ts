import type { NostrMetadata, UnsignedNostrEvent } from "./types";

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
 */
export function buildCompletionEvent(params: {
  creatorPubkey: string;
  challengeSlug: string;
  content: string;
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

  return {
    kind: 7101,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: params.content,
  };
}

/**
 * Build a Badge Award event (kind 8, NIP-58).
 * The creator signs this to award a badge to a participant.
 */
export function buildBadgeAwardEvent(params: {
  badgeName: string;
  challengeSlug: string;
  creatorPubkey: string;
  recipientPubkey: string;
}): UnsignedNostrEvent {
  return {
    kind: 8,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["a", `30100:${params.creatorPubkey}:${params.challengeSlug}`],
      ["p", params.recipientPubkey],
      ["badge", params.badgeName],
    ],
    content: "",
  };
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
