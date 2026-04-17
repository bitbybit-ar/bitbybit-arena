import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateForm } from "@/lib/schemas/validate-form";

describe("validateForm", () => {
  const Schema = z.object({
    title: z.string().min(3, "title must be at least 3 chars"),
    age: z.number().int().nonnegative("age must be non-negative"),
    nested: z.object({ tag: z.string().regex(/^[a-z]+$/, "lowercase only") }),
  });

  it("returns parsed data on success", () => {
    const result = validateForm(Schema, {
      title: "valid",
      age: 30,
      nested: { tag: "abc" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        title: "valid",
        age: 30,
        nested: { tag: "abc" },
      });
    }
  });

  it("collects per-field errors keyed by dotted path", () => {
    const result = validateForm(Schema, {
      title: "ab",
      age: -1,
      nested: { tag: "ABC" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.title).toBe("title must be at least 3 chars");
      expect(result.fieldErrors.age).toBe("age must be non-negative");
      expect(result.fieldErrors["nested.tag"]).toBe("lowercase only");
    }
  });

  it("formats firstError as 'path: message'", () => {
    const result = validateForm(Schema, {
      title: "ab",
      age: 30,
      nested: { tag: "abc" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.firstError).toBe("title: title must be at least 3 chars");
    }
  });

  it("uses just the message when issue has empty path", () => {
    const TopLevelSchema = z
      .object({ a: z.string().optional() })
      .refine((v) => Object.keys(v).length > 0, "No fields to update");
    const result = validateForm(TopLevelSchema, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.firstError).toBe("No fields to update");
    }
  });

  it("first issue per field wins when the same field has multiple issues", () => {
    const PickySchema = z.object({
      name: z
        .string()
        .min(3, "too short")
        .regex(/^[a-z]+$/, "lowercase only"),
    });
    const result = validateForm(PickySchema, { name: "AB" });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Only the first issue is recorded for `name` — Zod emits both
      // "too short" and "lowercase only" but the helper keeps the
      // earlier one to match the server's "first issue only" contract.
      expect(result.fieldErrors.name).toBe("too short");
    }
  });
});
