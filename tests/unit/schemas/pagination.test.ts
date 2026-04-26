import { describe, it, expect } from "vitest";
import { IsoCursorSchema, LimitSchema } from "@/lib/schemas/pagination";

describe("IsoCursorSchema", () => {
  it("accepts undefined", () => {
    expect(IsoCursorSchema.parse(undefined)).toBeUndefined();
  });

  it("accepts a valid ISO timestamp", () => {
    const iso = "2025-01-15T10:30:00.000Z";
    expect(IsoCursorSchema.parse(iso)).toBe(iso);
  });

  it("rejects an unparseable date string", () => {
    expect(IsoCursorSchema.safeParse("not-a-date").success).toBe(false);
  });
});

describe("LimitSchema", () => {
  const Schema = LimitSchema(1, 50, 20);

  it("returns the default for undefined", () => {
    expect(Schema.parse(undefined)).toBe(20);
  });

  it("returns the default for non-numeric input", () => {
    expect(Schema.parse("abc")).toBe(20);
  });

  it("returns the default for zero or negative numbers", () => {
    expect(Schema.parse("0")).toBe(20);
    expect(Schema.parse("-5")).toBe(20);
  });

  it("clamps to the maximum", () => {
    expect(Schema.parse("100")).toBe(50);
  });

  it("respects the minimum", () => {
    const FloorSchema = LimitSchema(5, 50, 20);
    expect(FloorSchema.parse("1")).toBe(5);
  });

  it("floors fractional values", () => {
    expect(Schema.parse("12.7")).toBe(12);
  });
});
