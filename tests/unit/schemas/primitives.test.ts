import { describe, it, expect } from "vitest";
import {
  CsvHexListSchema,
  HashtagSchema,
  Hex128Schema,
  Hex64Schema,
  NostrPubkeySchema,
  SlugSchema,
  TagsSchema,
} from "@/lib/schemas/primitives";

const HEX64 = "a".repeat(64);
const HEX128 = "b".repeat(128);

describe("Hex64Schema", () => {
  it("accepts a 64-hex string and lowercases it", () => {
    const out = Hex64Schema.parse("A".repeat(64));
    expect(out).toBe("a".repeat(64));
  });

  it("trims whitespace before validating", () => {
    expect(Hex64Schema.parse(`  ${HEX64}  `)).toBe(HEX64);
  });

  it("rejects strings that are not 64 hex chars", () => {
    expect(Hex64Schema.safeParse("abc").success).toBe(false);
    expect(Hex64Schema.safeParse("z".repeat(64)).success).toBe(false);
    expect(Hex64Schema.safeParse("a".repeat(63)).success).toBe(false);
    expect(Hex64Schema.safeParse("a".repeat(65)).success).toBe(false);
  });

  it("NostrPubkeySchema is an alias of Hex64Schema", () => {
    expect(NostrPubkeySchema.parse(HEX64)).toBe(HEX64);
    expect(NostrPubkeySchema.safeParse("nope").success).toBe(false);
  });
});

describe("Hex128Schema", () => {
  it("accepts a 128-hex string and lowercases it", () => {
    expect(Hex128Schema.parse("B".repeat(128))).toBe(HEX128);
  });

  it("rejects strings that are not 128 hex chars", () => {
    expect(Hex128Schema.safeParse(HEX64).success).toBe(false);
    expect(Hex128Schema.safeParse("z".repeat(128)).success).toBe(false);
  });
});

describe("HashtagSchema", () => {
  it("strips a leading '#' and lowercases", () => {
    expect(HashtagSchema.parse("#FooBar")).toBe("foobar");
    expect(HashtagSchema.parse("foobar")).toBe("foobar");
  });

  it("trims surrounding whitespace", () => {
    expect(HashtagSchema.parse("  #foo  ")).toBe("foo");
  });

  it("accepts letters, digits, and underscore from 2 to 50 chars", () => {
    expect(HashtagSchema.parse("ab")).toBe("ab");
    expect(HashtagSchema.parse("a_b9")).toBe("a_b9");
    expect(HashtagSchema.parse("a".repeat(50))).toBe("a".repeat(50));
  });

  it("rejects single-char, oversized, or non-allowed-character hashtags", () => {
    expect(HashtagSchema.safeParse("a").success).toBe(false);
    expect(HashtagSchema.safeParse("a".repeat(51)).success).toBe(false);
    expect(HashtagSchema.safeParse("foo-bar").success).toBe(false);
    expect(HashtagSchema.safeParse("hello world").success).toBe(false);
  });
});

describe("SlugSchema", () => {
  it("accepts lowercase letters, digits, and hyphens up to 100 chars", () => {
    expect(SlugSchema.parse("my-challenge-1")).toBe("my-challenge-1");
    expect(SlugSchema.parse("a".repeat(100))).toBe("a".repeat(100));
  });

  it("does not lowercase or transform the input", () => {
    expect(SlugSchema.safeParse("My-Slug").success).toBe(false);
  });

  it("rejects empty strings, oversized strings, and forbidden characters", () => {
    expect(SlugSchema.safeParse("").success).toBe(false);
    expect(SlugSchema.safeParse("a".repeat(101)).success).toBe(false);
    expect(SlugSchema.safeParse("foo bar").success).toBe(false);
    expect(SlugSchema.safeParse("foo_bar").success).toBe(false);
  });
});

describe("TagsSchema", () => {
  it("trims, lowercases, and replaces spaces with hyphens", () => {
    const out = TagsSchema.parse(["  Hello World  ", "Foo"]);
    expect(out).toEqual(["hello-world", "foo"]);
  });

  it("dedupes tags after normalisation", () => {
    const out = TagsSchema.parse(["foo", "FOO", "foo"]);
    expect(out).toEqual(["foo"]);
  });

  it("drops entries that normalise to an empty string", () => {
    const out = TagsSchema.parse(["foo", "  ", ""]);
    expect(out).toEqual(["foo"]);
  });

  it("rejects an array with more than MAX_TAGS entries", () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(TagsSchema.safeParse(tooMany).success).toBe(false);
  });

  it("rejects a tag whose normalised form has invalid chars", () => {
    // '@' becomes literal '@' after normalisation, which TAG_RE rejects
    expect(TagsSchema.safeParse(["foo@bar"]).success).toBe(false);
  });

  it("returns an empty array when all entries normalise to empty", () => {
    expect(TagsSchema.parse([" ", ""])).toEqual([]);
  });
});

describe("CsvHexListSchema", () => {
  const Schema = CsvHexListSchema(1000);

  it("returns an empty array for undefined or empty input", () => {
    expect(Schema.parse(undefined)).toEqual([]);
    expect(Schema.parse("")).toEqual([]);
  });

  it("splits on commas, lowercases, and dedupes valid 64-hex entries", () => {
    const out = Schema.parse(`${"A".repeat(64)},${"a".repeat(64)},${"b".repeat(64)}`);
    expect(out).toEqual(["a".repeat(64), "b".repeat(64)]);
  });

  it("silently drops entries that are not valid 64-hex", () => {
    const out = Schema.parse(`not-a-hex,${HEX64},also-bad`);
    expect(out).toEqual([HEX64]);
  });

  it("caps results at the configured maximum", () => {
    const Capped = CsvHexListSchema(2);
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    const c = "c".repeat(64);
    const out = Capped.parse(`${a},${b},${c}`);
    expect(out.length).toBe(2);
    expect(out).toEqual([a, b]);
  });
});
