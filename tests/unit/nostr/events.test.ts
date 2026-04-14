import { describe, it, expect } from "vitest";
import { buildCompletionEvent } from "@/lib/nostr/events";

const CREATOR = "a".repeat(64);
const SLUG = "challenge-slug";

function imetaTag(tags: string[][]): string[] | undefined {
  return tags.find((t) => t[0] === "imeta");
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
