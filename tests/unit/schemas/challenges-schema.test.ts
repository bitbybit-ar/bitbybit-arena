/**
 * Schema-level tests for `lib/schemas/challenges`.
 *
 * The route-level POST /api/challenges flow is covered in
 * tests/unit/challenges.test.ts. This file targets the *other* schemas
 * exported from the same module — Update, Award, RecordReward,
 * MyChallengesQuery, ListChallengesQuery — plus a couple of cross-field
 * branches on the create schema that the route tests don't exercise.
 */
import { describe, it, expect } from "vitest";
import {
  AwardBadgesBodySchema,
  CreateChallengeBodySchema,
  ListChallengesQuerySchema,
  MyChallengesQuerySchema,
  RecordBadgeAwardBodySchema,
  RecordRewardBodySchema,
  UpdateChallengeBodySchema,
} from "@/lib/schemas/challenges";

const HEX64 = "a".repeat(64);
const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("CreateChallengeBodySchema (cross-field rules)", () => {
  const valid = {
    title: "Valid Title",
    description: "Long enough description",
  };

  it("rejects nostr_action verification without a target event id", () => {
    const result = CreateChallengeBodySchema.safeParse({
      ...valid,
      verification_methods: ["nostr_action"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual([
        "nostr_action_target_event_id",
      ]);
    }
  });

  it("rejects nostr_hashtag verification without a hashtag", () => {
    const result = CreateChallengeBodySchema.safeParse({
      ...valid,
      verification_methods: ["nostr_hashtag"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["nostr_hashtag"]);
    }
  });

  it("rejects checkpoint_mode != 'none' with no checkpoints", () => {
    const result = CreateChallengeBodySchema.safeParse({
      ...valid,
      checkpoint_mode: "sequential",
      checkpoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 checkpoints", () => {
    const cps = Array.from({ length: 21 }, (_, i) => ({
      title: `Checkpoint ${i}`,
      verification_methods: ["creator_approval" as const],
    }));
    const result = CreateChallengeBodySchema.safeParse({
      ...valid,
      checkpoint_mode: "sequential",
      checkpoints: cps,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a checkpoint that uses nostr_action without a target event id", () => {
    const result = CreateChallengeBodySchema.safeParse({
      ...valid,
      checkpoint_mode: "sequential",
      checkpoints: [
        { title: "Step one", verification_methods: ["nostr_action"] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("dedupes verification_methods", () => {
    const out = CreateChallengeBodySchema.parse({
      ...valid,
      verification_methods: ["creator_approval", "creator_approval"],
    });
    expect(out.verification_methods).toEqual(["creator_approval"]);
  });

  it("rejects automatic combined with another verification method", () => {
    const result = CreateChallengeBodySchema.safeParse({
      ...valid,
      verification_methods: ["automatic", "creator_approval"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.path.includes("verification_methods")
        )
      ).toBe(true);
    }
  });

  it("accepts automatic on its own", () => {
    const out = CreateChallengeBodySchema.parse({
      ...valid,
      verification_methods: ["automatic"],
    });
    expect(out.verification_methods).toEqual(["automatic"]);
  });

  it("accepts creator_approval combined with both Nostr methods", () => {
    const out = CreateChallengeBodySchema.parse({
      ...valid,
      verification_methods: [
        "creator_approval",
        "nostr_action",
        "nostr_hashtag",
      ],
      nostr_action_target_event_id: HEX64,
      nostr_hashtag: "arenahackathon",
    });
    expect(out.verification_methods).toEqual([
      "creator_approval",
      "nostr_action",
      "nostr_hashtag",
    ]);
  });

  it("rejects a checkpoint that combines automatic with another method", () => {
    const result = CreateChallengeBodySchema.safeParse({
      ...valid,
      checkpoint_mode: "sequential",
      checkpoints: [
        {
          title: "Step one",
          verification_methods: ["automatic", "creator_approval"],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("requires a payout distribution when prize_amount_sats > 0", () => {
    const result = CreateChallengeBodySchema.safeParse({
      ...valid,
      prize_amount_sats: 1000,
      prize_distribution: "none",
    });
    expect(result.success).toBe(false);
  });

  it("accepts prize_amount_sats = 0 with prize_distribution = 'none'", () => {
    const out = CreateChallengeBodySchema.parse({
      ...valid,
      prize_amount_sats: 0,
      prize_distribution: "none",
    });
    expect(out.prize_amount_sats).toBe(0);
  });
});

describe("UpdateChallengeBodySchema", () => {
  it("rejects an empty body", () => {
    const result = UpdateChallengeBodySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("No fields to update");
    }
  });

  it("accepts a single optional field", () => {
    const out = UpdateChallengeBodySchema.parse({ status: "completed" });
    expect(out.status).toBe("completed");
  });

  it("rejects a negative goal", () => {
    expect(
      UpdateChallengeBodySchema.safeParse({ goal: -1 }).success
    ).toBe(false);
  });

  it("rejects a non-integer goal", () => {
    expect(
      UpdateChallengeBodySchema.safeParse({ goal: 1.5 }).success
    ).toBe(false);
  });

  it("rejects a non-http(s) badge_image_url", () => {
    expect(
      UpdateChallengeBodySchema.safeParse({
        badge_image_url: "data:image/png;base64,xxx",
      }).success
    ).toBe(false);
  });

  it("rejects an invalid status enum", () => {
    expect(
      UpdateChallengeBodySchema.safeParse({ status: "archived" }).success
    ).toBe(false);
  });

  it("rejects a verification_methods update that combines automatic with another method", () => {
    expect(
      UpdateChallengeBodySchema.safeParse({
        verification_methods: ["automatic", "nostr_action"],
      }).success
    ).toBe(false);
  });

  it("accepts a verification_methods update with creator_approval + Nostr methods", () => {
    const out = UpdateChallengeBodySchema.parse({
      verification_methods: ["creator_approval", "nostr_hashtag"],
    });
    expect(out.verification_methods).toEqual([
      "creator_approval",
      "nostr_hashtag",
    ]);
  });
});

describe("AwardBadgesBodySchema", () => {
  it("requires at least one user_id", () => {
    expect(AwardBadgesBodySchema.safeParse({ user_ids: [] }).success).toBe(false);
  });

  it("accepts a list of UUIDs", () => {
    const out = AwardBadgesBodySchema.parse({ user_ids: [UUID] });
    expect(out.user_ids).toEqual([UUID]);
  });

  it("rejects entries that are not UUIDs", () => {
    expect(
      AwardBadgesBodySchema.safeParse({ user_ids: ["not-a-uuid"] }).success
    ).toBe(false);
  });
});

describe("RecordBadgeAwardBodySchema", () => {
  it("requires user_id and a 64-hex nostr_event_id", () => {
    expect(
      RecordBadgeAwardBodySchema.parse({
        user_id: UUID,
        nostr_event_id: HEX64,
      })
    ).toEqual({ user_id: UUID, nostr_event_id: HEX64 });
  });

  it("rejects a malformed nostr_event_id", () => {
    expect(
      RecordBadgeAwardBodySchema.safeParse({
        user_id: UUID,
        nostr_event_id: "short",
      }).success
    ).toBe(false);
  });
});

describe("RecordRewardBodySchema", () => {
  it("rejects an empty body", () => {
    expect(RecordRewardBodySchema.safeParse({}).success).toBe(false);
  });

  it("accepts user_id alone (mark winner paid)", () => {
    const out = RecordRewardBodySchema.parse({ user_id: UUID });
    expect(out.user_id).toBe(UUID);
  });

  it("accepts all_winners_paid: true alone", () => {
    const out = RecordRewardBodySchema.parse({ all_winners_paid: true });
    expect(out.all_winners_paid).toBe(true);
  });

  it("accepts user_id + receipt_event_id together", () => {
    const out = RecordRewardBodySchema.parse({
      user_id: UUID,
      receipt_event_id: HEX64,
    });
    expect(out.receipt_event_id).toBe(HEX64);
  });

  it("rejects receipt_event_id without user_id (when paired with all_winners_paid)", () => {
    // Need `all_winners_paid: true` to satisfy the "must mark something
    // paid" check, otherwise the schema short-circuits before the
    // user_id-with-receipt rule fires.
    const result = RecordRewardBodySchema.safeParse({
      receipt_event_id: HEX64,
      all_winners_paid: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["user_id"]);
    }
  });

  it("rejects an empty body with the top-level 'must include' message", () => {
    const result = RecordRewardBodySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/must include user_id/);
    }
  });

  it("rejects all_winners_paid: false alone (no real action)", () => {
    expect(
      RecordRewardBodySchema.safeParse({ all_winners_paid: false }).success
    ).toBe(false);
  });
});

describe("MyChallengesQuerySchema", () => {
  it("accepts an empty query (all tabs)", () => {
    const out = MyChallengesQuerySchema.parse({});
    expect(out.scope).toBeUndefined();
    expect(out.limit).toBe(20);
  });

  it("accepts scope + cursor together", () => {
    const out = MyChallengesQuerySchema.parse({
      scope: "created",
      cursor: "2025-01-15T10:00:00.000Z",
    });
    expect(out.scope).toBe("created");
  });

  it("rejects a cursor without a scope", () => {
    const result = MyChallengesQuerySchema.safeParse({
      cursor: "2025-01-15T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("clamps limit to 50", () => {
    expect(MyChallengesQuerySchema.parse({ limit: "1000" }).limit).toBe(50);
  });

  it("rejects an invalid scope value", () => {
    expect(
      MyChallengesQuerySchema.safeParse({ scope: "everything" }).success
    ).toBe(false);
  });
});

describe("ListChallengesQuerySchema", () => {
  it("defaults sort to 'newest'", () => {
    expect(ListChallengesQuerySchema.parse({}).sort).toBe("newest");
  });

  it("clamps limit to 50 max and defaults to 20 for invalid input", () => {
    expect(ListChallengesQuerySchema.parse({ limit: "100" }).limit).toBe(50);
    expect(ListChallengesQuerySchema.parse({ limit: "abc" }).limit).toBe(20);
    expect(ListChallengesQuerySchema.parse({ limit: "0" }).limit).toBe(20);
  });

  it("splits CSV type filter into a typed array", () => {
    const out = ListChallengesQuerySchema.parse({
      type: "one_time,streak,nonsense",
    });
    expect(out.types).toEqual(["one_time", "streak"]);
  });

  it("normalises CSV tags to lowercase and drops invalid ones", () => {
    const out = ListChallengesQuerySchema.parse({
      tags: "Fitness,reading,bad tag,with space",
    });
    expect(out.tagsList).toEqual(["fitness", "reading"]);
  });

  it("parses follow_pubkeys into a deduped 64-hex array", () => {
    const a = "a".repeat(64);
    const out = ListChallengesQuerySchema.parse({
      follow_pubkeys: `${a},${a.toUpperCase()},notahex`,
    });
    expect(out.follow_pubkeys).toEqual([a]);
  });

  it("only_following is true only when the literal string 'true' is sent", () => {
    expect(ListChallengesQuerySchema.parse({ only_following: "true" }).only_following).toBe(
      true
    );
    expect(
      ListChallengesQuerySchema.parse({ only_following: "1" }).only_following
    ).toBe(false);
    expect(ListChallengesQuerySchema.parse({}).only_following).toBe(false);
  });

  it("rejects an unknown sort value", () => {
    expect(
      ListChallengesQuerySchema.safeParse({ sort: "alphabetical" }).success
    ).toBe(false);
  });
});
