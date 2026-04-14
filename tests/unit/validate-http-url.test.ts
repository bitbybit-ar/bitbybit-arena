import { describe, it, expect } from "vitest";
import { validateHttpUrl, MAX_URL_LEN } from "@/lib/api/validate-http-url";
import { BadRequestError } from "@/lib/api/errors";

describe("validateHttpUrl", () => {
  it("returns null for empty / null / undefined", () => {
    expect(validateHttpUrl(undefined, "f")).toBeNull();
    expect(validateHttpUrl(null, "f")).toBeNull();
    expect(validateHttpUrl("", "f")).toBeNull();
    expect(validateHttpUrl("   ", "f")).toBeNull();
  });

  it("returns the trimmed value for https and http URLs", () => {
    expect(validateHttpUrl("  https://blossom.example/x.png ", "f")).toBe(
      "https://blossom.example/x.png"
    );
    expect(validateHttpUrl("http://example.com", "f")).toBe(
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
      expect(() => validateHttpUrl(bad, "f")).toThrow(BadRequestError);
    }
  });

  it("rejects non-string inputs", () => {
    expect(() => validateHttpUrl(42, "f")).toThrow(BadRequestError);
    expect(() => validateHttpUrl({}, "f")).toThrow(BadRequestError);
    expect(() => validateHttpUrl(["https://x.com"], "f")).toThrow(
      BadRequestError
    );
  });

  it("rejects strings longer than the max", () => {
    const tooLong = "https://x.com/" + "a".repeat(MAX_URL_LEN);
    expect(() => validateHttpUrl(tooLong, "f")).toThrow(BadRequestError);
  });

  it("mentions the field name in the error", () => {
    try {
      validateHttpUrl("javascript:evil", "badge_image_url");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).message).toContain("badge_image_url");
    }
  });
});
