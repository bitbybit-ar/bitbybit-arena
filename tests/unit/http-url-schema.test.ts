import { describe, it, expect } from "vitest";
import { HttpUrlSchema, MAX_URL_LEN } from "@/lib/schemas/primitives";

describe("HttpUrlSchema", () => {
  it("returns null for empty / null / undefined / whitespace-only", () => {
    expect(HttpUrlSchema.parse(undefined)).toBeNull();
    expect(HttpUrlSchema.parse(null)).toBeNull();
    expect(HttpUrlSchema.parse("")).toBeNull();
    expect(HttpUrlSchema.parse("   ")).toBeNull();
  });

  it("returns the trimmed value for https and http URLs", () => {
    expect(HttpUrlSchema.parse("  https://blossom.example/x.png ")).toBe(
      "https://blossom.example/x.png"
    );
    expect(HttpUrlSchema.parse("http://example.com")).toBe(
      "http://example.com"
    );
  });

  it("rejects javascript:, data:, file:, ftp:, and bare paths", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:image/png;base64,iVBOR",
      "file:///etc/passwd",
      "ftp://example.com/x.png",
      "/relative/path.png",
      "example.com/x.png",
    ]) {
      const result = HttpUrlSchema.safeParse(bad);
      expect(result.success).toBe(false);
    }
  });

  it("rejects non-string inputs", () => {
    expect(HttpUrlSchema.safeParse(42).success).toBe(false);
    expect(HttpUrlSchema.safeParse({}).success).toBe(false);
    expect(HttpUrlSchema.safeParse(["https://x.com"]).success).toBe(false);
  });

  it("rejects strings longer than the max", () => {
    const tooLong = "https://x.com/" + "a".repeat(MAX_URL_LEN);
    const result = HttpUrlSchema.safeParse(tooLong);
    expect(result.success).toBe(false);
  });

  it("issue message mentions the http(s) requirement for bad schemes", () => {
    const result = HttpUrlSchema.safeParse("javascript:evil");
    if (result.success) throw new Error("should have failed");
    expect(result.error.issues[0].message).toMatch(/http\(s\)/);
  });
});
