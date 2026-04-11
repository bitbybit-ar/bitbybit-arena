import { describe, it, expect } from "vitest";
import { normalizeTags } from "@/lib/api/normalize-tags";
import { BadRequestError } from "@/lib/api/errors";

describe("normalizeTags", () => {
  it("returns empty array for null/undefined", () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it("returns empty array for an empty input array", () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it("lowercases and trims entries", () => {
    expect(normalizeTags([" Fitness ", "READING"])).toEqual(["fitness", "reading"]);
  });

  it("converts spaces to hyphens", () => {
    expect(normalizeTags(["hack a thon"])).toEqual(["hack-a-thon"]);
  });

  it("deduplicates after normalization", () => {
    expect(normalizeTags(["fitness", "Fitness", " FITNESS "])).toEqual(["fitness"]);
  });

  it("skips whitespace-only entries", () => {
    expect(normalizeTags(["", "  ", "fitness"])).toEqual(["fitness"]);
  });

  it("rejects non-array input", () => {
    expect(() => normalizeTags("fitness")).toThrow(BadRequestError);
    expect(() => normalizeTags(42)).toThrow(BadRequestError);
    expect(() => normalizeTags({})).toThrow(BadRequestError);
  });

  it("rejects arrays with non-string entries", () => {
    expect(() => normalizeTags(["ok", 1])).toThrow(BadRequestError);
  });

  it("rejects more than 10 entries", () => {
    const many = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    expect(() => normalizeTags(many)).toThrow(/at most 10/);
  });

  it("accepts exactly 10 entries", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(normalizeTags(ten)).toHaveLength(10);
  });

  it("rejects entries with uppercase-only non-alphanum characters", () => {
    expect(() => normalizeTags(["bad tag!"])).toThrow(/Invalid tag/);
    expect(() => normalizeTags(["under_score"])).toThrow(/Invalid tag/);
  });

  it("rejects entries longer than 30 chars", () => {
    expect(() => normalizeTags(["a".repeat(31)])).toThrow(/Invalid tag/);
  });

  it("accepts hyphens, digits, and hyphenated phrases", () => {
    expect(normalizeTags(["web3", "a-b-c", "100-day"])).toEqual(["web3", "a-b-c", "100-day"]);
  });
});
