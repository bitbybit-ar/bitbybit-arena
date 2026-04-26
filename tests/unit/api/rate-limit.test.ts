import { describe, it, expect } from "vitest";
import { defaultRateLimitStore } from "@/lib/api/rate-limit";

describe("defaultRateLimitStore (in-memory)", () => {
  it("returns undefined for an unseen key", () => {
    expect(defaultRateLimitStore.get("never-seen-key")).toBeUndefined();
  });

  it("round-trips a get after a set", () => {
    const key = `test:${Math.random()}`;
    const entry = { count: 3, resetAt: Date.now() + 60_000 };
    defaultRateLimitStore.set(key, entry);
    expect(defaultRateLimitStore.get(key)).toEqual(entry);
  });

  it("overwrites an existing entry", () => {
    const key = `test:${Math.random()}`;
    defaultRateLimitStore.set(key, { count: 1, resetAt: 100 });
    defaultRateLimitStore.set(key, { count: 5, resetAt: 200 });
    expect(defaultRateLimitStore.get(key)).toEqual({ count: 5, resetAt: 200 });
  });
});
