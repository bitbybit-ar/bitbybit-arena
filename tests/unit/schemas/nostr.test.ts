import { describe, it, expect } from "vitest";
import { NostrEventSchema } from "@/lib/schemas/nostr";

const validEvent = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  sig: "c".repeat(128),
  created_at: 1700000000,
  kind: 1,
  content: "hello",
  tags: [
    ["e", "d".repeat(64)],
    ["p", "e".repeat(64), "wss://relay.example"],
  ],
};

describe("NostrEventSchema", () => {
  it("accepts a well-formed NIP-01 event", () => {
    const out = NostrEventSchema.parse(validEvent);
    expect(out.id).toBe(validEvent.id);
    expect(out.sig).toBe(validEvent.sig);
  });

  it("rejects when sig is not 128 hex chars", () => {
    expect(
      NostrEventSchema.safeParse({ ...validEvent, sig: "c".repeat(64) }).success
    ).toBe(false);
  });

  it("rejects when id or pubkey is not 64 hex chars", () => {
    expect(
      NostrEventSchema.safeParse({ ...validEvent, id: "shortid" }).success
    ).toBe(false);
    expect(
      NostrEventSchema.safeParse({ ...validEvent, pubkey: "z".repeat(64) }).success
    ).toBe(false);
  });

  it("rejects negative or non-integer kind / created_at", () => {
    expect(
      NostrEventSchema.safeParse({ ...validEvent, kind: -1 }).success
    ).toBe(false);
    expect(
      NostrEventSchema.safeParse({ ...validEvent, created_at: 1.5 }).success
    ).toBe(false);
  });

  it("rejects when tags is not a string[][]", () => {
    expect(
      NostrEventSchema.safeParse({ ...validEvent, tags: [["e", 1]] }).success
    ).toBe(false);
    expect(
      NostrEventSchema.safeParse({ ...validEvent, tags: "wrong" }).success
    ).toBe(false);
  });

  it("accepts an empty content string and empty tags array", () => {
    const out = NostrEventSchema.parse({ ...validEvent, content: "", tags: [] });
    expect(out.content).toBe("");
    expect(out.tags).toEqual([]);
  });

  it("normalises mixed-case hex to lowercase", () => {
    const out = NostrEventSchema.parse({
      ...validEvent,
      id: "A".repeat(64),
      pubkey: "B".repeat(64),
      sig: "C".repeat(128),
    });
    expect(out.id).toBe("a".repeat(64));
    expect(out.pubkey).toBe("b".repeat(64));
    expect(out.sig).toBe("c".repeat(128));
  });
});
