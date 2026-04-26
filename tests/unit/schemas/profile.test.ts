import { describe, it, expect } from "vitest";
import {
  LocaleSchema,
  NotificationPrefsSchema,
  UpdateProfileBodySchema,
} from "@/lib/schemas/profile";

describe("LocaleSchema", () => {
  it("accepts es and en", () => {
    expect(LocaleSchema.parse("es")).toBe("es");
    expect(LocaleSchema.parse("en")).toBe("en");
  });

  it("rejects other values", () => {
    expect(LocaleSchema.safeParse("fr").success).toBe(false);
    expect(LocaleSchema.safeParse("EN").success).toBe(false);
  });
});

describe("NotificationPrefsSchema", () => {
  it("accepts a partial map of known notification types to booleans", () => {
    const out = NotificationPrefsSchema.parse({
      challenge_joined: false,
      badge_earned: true,
    });
    expect(out).toEqual({ challenge_joined: false, badge_earned: true });
  });

  it("rejects an empty patch", () => {
    expect(NotificationPrefsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown notification keys", () => {
    expect(
      NotificationPrefsSchema.safeParse({ invented_event: true }).success
    ).toBe(false);
  });

  it("rejects non-boolean values", () => {
    expect(
      NotificationPrefsSchema.safeParse({ badge_earned: "yes" }).success
    ).toBe(false);
  });
});

describe("UpdateProfileBodySchema", () => {
  it("accepts a single optional field", () => {
    const out = UpdateProfileBodySchema.parse({ display_name: "  Alice  " });
    expect(out.display_name).toBe("Alice");
  });

  it("rejects an empty body — at least one field is required", () => {
    const result = UpdateProfileBodySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("No fields to update");
    }
  });

  it("rejects a display_name that becomes empty after trim", () => {
    expect(
      UpdateProfileBodySchema.safeParse({ display_name: "   " }).success
    ).toBe(false);
  });

  it("rejects a username shorter than 3 chars after trim", () => {
    expect(
      UpdateProfileBodySchema.safeParse({ username: "ab" }).success
    ).toBe(false);
  });

  it("rejects an avatar_url with a non-http(s) scheme", () => {
    expect(
      UpdateProfileBodySchema.safeParse({
        avatar_url: "javascript:alert(1)",
      }).success
    ).toBe(false);
  });

  it("accepts about and lightning_address as nullish strings", () => {
    const out = UpdateProfileBodySchema.parse({
      about: "Bitcoiner from Buenos Aires",
      lightning_address: "alice@walletofsatoshi.com",
    });
    expect(out.about).toBe("Bitcoiner from Buenos Aires");
    expect(out.lightning_address).toBe("alice@walletofsatoshi.com");
  });

  it("accepts a notification_prefs patch", () => {
    const out = UpdateProfileBodySchema.parse({
      notification_prefs: { prize_awarded: false },
    });
    expect(out.notification_prefs).toEqual({ prize_awarded: false });
  });

  it("rejects an unknown locale", () => {
    expect(
      UpdateProfileBodySchema.safeParse({ locale: "pt" }).success
    ).toBe(false);
  });
});
