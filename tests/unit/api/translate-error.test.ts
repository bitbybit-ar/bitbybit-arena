import { describe, it, expect, vi } from "vitest";
import { translateApiError } from "@/lib/api/translate-error";

describe("translateApiError", () => {
  it("returns the fallback when json is null/undefined", () => {
    expect(translateApiError(null, () => "x", "fb")).toBe("fb");
    expect(translateApiError(undefined, () => "x", "fb")).toBe("fb");
  });

  it("returns the translated string when the translator resolves the code", () => {
    const t = vi.fn((key: string) => (key === "rate_limit" ? "Demasiadas peticiones" : key));
    expect(
      translateApiError({ code: "rate_limit", error: "Too many" }, t, "fb")
    ).toBe("Demasiadas peticiones");
    expect(t).toHaveBeenCalledWith("rate_limit");
  });

  it("falls back to the server's English error string when translation returns the same key", () => {
    // next-intl returns the key itself when no translation is registered.
    // The helper interprets that as "no translation" and falls back to
    // the server-provided English message.
    const t = (key: string) => key;
    expect(
      translateApiError({ code: "rate_limit", error: "Too many" }, t, "fb")
    ).toBe("Too many");
  });

  it("falls back to the server's error string when the translator throws", () => {
    const t = () => {
      throw new Error("missing key");
    };
    expect(
      translateApiError({ code: "rate_limit", error: "Too many" }, t, "fb")
    ).toBe("Too many");
  });

  it("returns the fallback when neither code nor error are usable", () => {
    expect(translateApiError({}, () => "x", "fb")).toBe("fb");
  });

  it("ignores a non-string error field and falls back", () => {
    expect(
      translateApiError(
        { error: 42 as unknown as string },
        () => "x",
        "fb"
      )
    ).toBe("fb");
  });
});
