import { describe, it, expect } from "vitest";
import {
  buildCompletionEvent,
  buildBadgeDefinitionEvent,
  buildBadgeAwardEvent,
  buildProfileBadgesEvent,
  parseProfileBadgesPairs,
  buildChallengeResultEvent,
  placeLabel,
} from "@/lib/nostr/events";

const CREATOR = "a".repeat(64);
const SLUG = "challenge-slug";

function imetaTag(tags: string[][]): string[] | undefined {
  return tags.find((t) => t[0] === "imeta");
}

function tagFor(tags: string[][], key: string): string[][] {
  return tags.filter((t) => t[0] === key);
}

describe("buildCompletionEvent", () => {
  it("omits any imeta tag when no image descriptor is passed", () => {
    const event = buildCompletionEvent({
      creatorPubkey: CREATOR,
      challengeSlug: SLUG,
      content: "did the thing",
    });

    expect(event.kind).toBe(7101);
    expect(imetaTag(event.tags)).toBeUndefined();
    expect(event.content).toBe("did the thing");
  });

  it("emits only `url` when the descriptor has only a url", () => {
    const event = buildCompletionEvent({
      creatorPubkey: CREATOR,
      challengeSlug: SLUG,
      content: "did the thing",
      imageDescriptor: { url: "https://cdn.example/abc.png" },
    });

    expect(imetaTag(event.tags)).toEqual([
      "imeta",
      "url https://cdn.example/abc.png",
    ]);
    // URL is also appended to the content for client previews.
    expect(event.content).toBe("did the thing\n\nhttps://cdn.example/abc.png");
  });

  it("emits url + m + x + size when a full descriptor is passed", () => {
    const event = buildCompletionEvent({
      creatorPubkey: CREATOR,
      challengeSlug: SLUG,
      content: "did the thing",
      imageDescriptor: {
        url: "https://cdn.example/abc.png",
        type: "image/png",
        sha256: "b".repeat(64),
        size: 12345,
      },
    });

    expect(imetaTag(event.tags)).toEqual([
      "imeta",
      "url https://cdn.example/abc.png",
      "m image/png",
      `x ${"b".repeat(64)}`,
      "size 12345",
    ]);
  });

  it("includes size=0 but still omits missing fields", () => {
    const event = buildCompletionEvent({
      creatorPubkey: CREATOR,
      challengeSlug: SLUG,
      content: "did the thing",
      imageDescriptor: {
        url: "https://cdn.example/abc.png",
        size: 0,
      },
    });

    expect(imetaTag(event.tags)).toEqual([
      "imeta",
      "url https://cdn.example/abc.png",
      "size 0",
    ]);
  });
});

describe("buildBadgeDefinitionEvent (kind 30009)", () => {
  it("emits the required NIP-58 tags with slug as the d-tag", () => {
    const event = buildBadgeDefinitionEvent({
      slug: "30-day-meditation",
      name: "30-Day Zen Master",
      description: "Meditate every day for 30 days",
      image: "https://blossom.example/badge.png",
    });

    expect(event.kind).toBe(30009);
    expect(event.content).toBe("");

    expect(tagFor(event.tags, "d")).toEqual([["d", "30-day-meditation"]]);
    expect(tagFor(event.tags, "name")).toEqual([["name", "30-Day Zen Master"]]);
    expect(tagFor(event.tags, "description")).toEqual([
      ["description", "Meditate every day for 30 days"],
    ]);
    expect(tagFor(event.tags, "image")).toEqual([
      ["image", "https://blossom.example/badge.png"],
    ]);
  });

  it("omits optional tags when not provided", () => {
    const event = buildBadgeDefinitionEvent({
      slug: "minimal-badge",
      name: "Minimal",
    });

    expect(tagFor(event.tags, "d")).toHaveLength(1);
    expect(tagFor(event.tags, "name")).toHaveLength(1);
    expect(tagFor(event.tags, "description")).toHaveLength(0);
    expect(tagFor(event.tags, "image")).toHaveLength(0);
    expect(tagFor(event.tags, "thumb")).toHaveLength(0);
    expect(tagFor(event.tags, "imeta")).toHaveLength(0);
  });

  it("emits a plain image tag with no imeta when only a URL string is passed", () => {
    const event = buildBadgeDefinitionEvent({
      slug: "url-only",
      name: "URL only",
      image: "https://blossom.example/badge.png",
    });
    expect(tagFor(event.tags, "image")).toEqual([
      ["image", "https://blossom.example/badge.png"],
    ]);
    expect(tagFor(event.tags, "imeta")).toHaveLength(0);
  });

  it("emits image + a sibling NIP-92 imeta tag when a descriptor is passed", () => {
    const event = buildBadgeDefinitionEvent({
      slug: "rich-badge",
      name: "Rich",
      image: {
        url: "https://blossom.example/badge.png",
        sha256: "b".repeat(64),
        size: 4096,
        type: "image/png",
      },
    });

    expect(tagFor(event.tags, "image")).toEqual([
      ["image", "https://blossom.example/badge.png"],
    ]);
    expect(tagFor(event.tags, "imeta")).toEqual([
      [
        "imeta",
        "url https://blossom.example/badge.png",
        "m image/png",
        `x ${"b".repeat(64)}`,
        "size 4096",
      ],
    ]);
  });

  it("skips the imeta tag when a descriptor carries only a URL (would be redundant)", () => {
    const event = buildBadgeDefinitionEvent({
      slug: "url-descriptor",
      name: "URL descriptor",
      image: { url: "https://blossom.example/badge.png" },
    });
    expect(tagFor(event.tags, "image")).toEqual([
      ["image", "https://blossom.example/badge.png"],
    ]);
    expect(tagFor(event.tags, "imeta")).toHaveLength(0);
  });

  it("emits only the metadata fields that are present on the descriptor", () => {
    const event = buildBadgeDefinitionEvent({
      slug: "partial",
      name: "Partial",
      image: {
        url: "https://blossom.example/badge.png",
        sha256: "c".repeat(64),
        // size + type omitted
      },
    });
    expect(tagFor(event.tags, "imeta")).toEqual([
      [
        "imeta",
        "url https://blossom.example/badge.png",
        `x ${"c".repeat(64)}`,
      ],
    ]);
  });
});

describe("buildBadgeAwardEvent (kind 8)", () => {
  it("a-tags the kind:30009 definition, not the kind:30100 challenge", () => {
    const event = buildBadgeAwardEvent({
      badgeDefinitionSlug: "30-day-meditation",
      issuerPubkey: "a".repeat(64),
      recipientPubkey: "b".repeat(64),
    });

    expect(event.kind).toBe(8);
    const aTags = tagFor(event.tags, "a");
    expect(aTags).toHaveLength(1);
    // The whole point of Phase A: the a-tag points at 30009, not 30100.
    expect(aTags[0][1]).toBe(`30009:${"a".repeat(64)}:30-day-meditation`);

    const pTags = tagFor(event.tags, "p");
    expect(pTags).toEqual([["p", "b".repeat(64)]]);
  });

  it("no longer carries a 'badge' tag (legacy, not part of NIP-58)", () => {
    const event = buildBadgeAwardEvent({
      badgeDefinitionSlug: "x",
      issuerPubkey: "a".repeat(64),
      recipientPubkey: "b".repeat(64),
    });
    expect(tagFor(event.tags, "badge")).toHaveLength(0);
  });
});

describe("buildProfileBadgesEvent (kind 30008)", () => {
  it("emits a d=profile_badges tag and alternating (a, e) pairs", () => {
    const event = buildProfileBadgesEvent([
      {
        definitionATag: `30009:${"a".repeat(64)}:badge-one`,
        awardEventId: "1".repeat(64),
      },
      {
        definitionATag: `30009:${"b".repeat(64)}:badge-two`,
        awardEventId: "2".repeat(64),
      },
    ]);

    expect(event.kind).toBe(30008);
    expect(tagFor(event.tags, "d")).toEqual([["d", "profile_badges"]]);

    // Pairs must appear in order: a then e, for each badge.
    const orderedPairs = event.tags.slice(1);
    expect(orderedPairs[0][0]).toBe("a");
    expect(orderedPairs[1][0]).toBe("e");
    expect(orderedPairs[2][0]).toBe("a");
    expect(orderedPairs[3][0]).toBe("e");
  });

  it("emits only the d-tag when the pair list is empty", () => {
    const event = buildProfileBadgesEvent([]);
    expect(event.tags).toEqual([["d", "profile_badges"]]);
  });
});

describe("parseProfileBadgesPairs", () => {
  it("extracts (a, e) pairs from a signed kind:30008 event", () => {
    const pairs = parseProfileBadgesPairs({
      tags: [
        ["d", "profile_badges"],
        ["a", `30009:${"a".repeat(64)}:alpha`],
        ["e", "1".repeat(64)],
        ["a", `30009:${"b".repeat(64)}:beta`],
        ["e", "2".repeat(64)],
      ],
    });
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({
      definitionATag: `30009:${"a".repeat(64)}:alpha`,
      awardEventId: "1".repeat(64),
    });
    expect(pairs[1].awardEventId).toBe("2".repeat(64));
  });

  it("skips a-tags that aren't kind:30009 references", () => {
    const pairs = parseProfileBadgesPairs({
      tags: [
        ["d", "profile_badges"],
        // someone put a 30100 reference in there — ignore it
        ["a", `30100:${"a".repeat(64)}:challenge`],
        ["e", "1".repeat(64)],
        ["a", `30009:${"b".repeat(64)}:beta`],
        ["e", "2".repeat(64)],
      ],
    });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].awardEventId).toBe("2".repeat(64));
  });

  it("round-trips a build → parse", () => {
    const original = [
      {
        definitionATag: `30009:${"a".repeat(64)}:alpha`,
        awardEventId: "1".repeat(64),
      },
      {
        definitionATag: `30009:${"b".repeat(64)}:beta`,
        awardEventId: "2".repeat(64),
      },
    ];
    const event = buildProfileBadgesEvent(original);
    expect(parseProfileBadgesPairs(event)).toEqual(original);
  });
});

describe("buildChallengeResultEvent (kind 30101)", () => {
  const winnerA = "1".repeat(64);
  const winnerB = "2".repeat(64);
  const winnerC = "3".repeat(64);
  const completerD = "4".repeat(64);

  it("emits d, a, winner, stats tags and defaults content to empty", () => {
    const event = buildChallengeResultEvent({
      slug: SLUG,
      creatorPubkey: CREATOR,
      winners: [
        { pubkey: winnerA, place: "1st", amountSats: 5000 },
        { pubkey: winnerB, place: "2nd", amountSats: 3000 },
        { pubkey: winnerC, place: "3rd", amountSats: 2000 },
      ],
      completerPubkeys: [],
      stats: {
        participants: 45,
        completions: 3,
        totalSats: 10000,
      },
    });

    expect(event.kind).toBe(30101);
    expect(event.content).toBe("");

    expect(tagFor(event.tags, "d")).toEqual([["d", `${SLUG}:results`]]);
    expect(tagFor(event.tags, "a")).toEqual([
      ["a", `30100:${CREATOR}:${SLUG}`],
    ]);
    expect(tagFor(event.tags, "winner")).toEqual([
      ["winner", winnerA, "1st", "5000"],
      ["winner", winnerB, "2nd", "3000"],
      ["winner", winnerC, "3rd", "2000"],
    ]);
    expect(tagFor(event.tags, "stats")).toEqual([
      ["stats", "participants:45", "completions:3", "total_sats:10000"],
    ]);
  });

  it("passes content through when provided", () => {
    const event = buildChallengeResultEvent({
      slug: SLUG,
      creatorPubkey: CREATOR,
      content: "GG",
      winners: [{ pubkey: winnerA, place: "1st", amountSats: 1000 }],
      completerPubkeys: [],
      stats: { participants: 1, completions: 1, totalSats: 1000 },
    });
    expect(event.content).toBe("GG");
  });

  it("adds completer tags for users who completed but aren't winners", () => {
    const event = buildChallengeResultEvent({
      slug: SLUG,
      creatorPubkey: CREATOR,
      winners: [{ pubkey: winnerA, place: "1st", amountSats: 1000 }],
      completerPubkeys: [completerD],
      stats: { participants: 10, completions: 2, totalSats: 1000 },
    });

    expect(tagFor(event.tags, "completer")).toEqual([
      ["completer", completerD],
    ]);
  });

  it("deduplicates completer entries that also appear in winners", () => {
    const event = buildChallengeResultEvent({
      slug: SLUG,
      creatorPubkey: CREATOR,
      winners: [{ pubkey: winnerA, place: "1st", amountSats: 1000 }],
      // winnerA is also in the completer list — should be filtered out.
      completerPubkeys: [winnerA, completerD],
      stats: { participants: 10, completions: 2, totalSats: 1000 },
    });

    expect(tagFor(event.tags, "completer")).toEqual([
      ["completer", completerD],
    ]);
  });
});

describe("placeLabel", () => {
  // Spot-check the canonical English ordinal cases.
  it.each([
    [0, "1st"],
    [1, "2nd"],
    [2, "3rd"],
    [3, "4th"],
    [4, "5th"],
    [5, "6th"],
    [6, "7th"],
    [7, "8th"],
    [8, "9th"],
    [9, "10th"],
  ])("position %i → %s", (index, expected) => {
    expect(placeLabel(index)).toBe(expected);
  });

  // The 11/12/13 exception is the part most likely to break in a refactor.
  it.each([
    [10, "11th"],
    [11, "12th"],
    [12, "13th"],
    [13, "14th"],
    [20, "21st"],
    [21, "22nd"],
    [22, "23rd"],
  ])("11/12/13 exception: position %i → %s", (index, expected) => {
    expect(placeLabel(index)).toBe(expected);
  });

  // Triple-digit edge case — the modulo logic should still hit the
  // exception at 111/112/113 but not at 101/102/103.
  it.each([
    [100, "101st"],
    [101, "102nd"],
    [102, "103rd"],
    [110, "111th"],
    [111, "112th"],
    [112, "113th"],
    [120, "121st"],
  ])("triple-digit: position %i → %s", (index, expected) => {
    expect(placeLabel(index)).toBe(expected);
  });
});
