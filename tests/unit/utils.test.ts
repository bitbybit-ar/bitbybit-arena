import { describe, it, expect } from "vitest";
import { cn, isUuid, slugify } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names with spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("returns an empty string when all inputs are falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});

describe("isUuid", () => {
  it("accepts canonical UUIDs case-insensitively", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("123e4567e89b12d3a456426614174000")).toBe(false);
    // wrong segment lengths
    expect(isUuid("123e4567-e89b-12d3-a456-42661417400")).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases, strips diacritics, and collapses non-alphanumerics to hyphens", () => {
    const slug = slugify("Café Olé! 30-day Streak");
    // shape: <base>-<5-char suffix>
    expect(slug).toMatch(/^cafe-ole-30-day-streak-[a-z0-9]{5}$/);
  });

  it("trims leading and trailing hyphens before adding the suffix", () => {
    const slug = slugify("---hello---");
    expect(slug.startsWith("hello-")).toBe(true);
    expect(slug.startsWith("-")).toBe(false);
  });

  it("clamps the base to 80 characters before the suffix", () => {
    const longTitle = "a".repeat(200);
    const slug = slugify(longTitle);
    // 80 base chars + "-" + 5 suffix chars = 86
    expect(slug.length).toBe(86);
    expect(slug.startsWith("a".repeat(80) + "-")).toBe(true);
  });

  it("appends a 5-char random suffix on each call", () => {
    const a = slugify("Same Title");
    const b = slugify("Same Title");
    expect(a).not.toBe(b);
  });
});
