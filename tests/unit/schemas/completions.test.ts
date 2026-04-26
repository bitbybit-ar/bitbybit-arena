import { describe, it, expect } from "vitest";
import {
  CompleteCheckpointBodySchema,
  ListCompletionsQuerySchema,
  MAX_REJECT_REASON_LEN,
  SubmitCompletionBodySchema,
  VerifyCheckpointCompletionBodySchema,
  VerifyCompletionBodySchema,
} from "@/lib/schemas/completions";

describe("VerifyCompletionBodySchema", () => {
  it("accepts approved with no reject_reason", () => {
    const out = VerifyCompletionBodySchema.parse({ status: "approved" });
    expect(out).toEqual({ status: "approved", reject_reason: null });
  });

  it("accepts rejected with a non-empty reason", () => {
    const out = VerifyCompletionBodySchema.parse({
      status: "rejected",
      reject_reason: "  not enough detail  ",
    });
    expect(out.reject_reason).toBe("not enough detail");
  });

  it("normalises empty / whitespace reject_reason to null", () => {
    expect(
      VerifyCompletionBodySchema.parse({ status: "rejected", reject_reason: "" })
        .reject_reason
    ).toBeNull();
    expect(
      VerifyCompletionBodySchema.parse({
        status: "rejected",
        reject_reason: "   ",
      }).reject_reason
    ).toBeNull();
  });

  it("rejects an unknown status value", () => {
    expect(
      VerifyCompletionBodySchema.safeParse({ status: "pending" }).success
    ).toBe(false);
  });

  it("rejects a reject_reason longer than the cap", () => {
    const tooLong = "x".repeat(MAX_REJECT_REASON_LEN + 1);
    expect(
      VerifyCompletionBodySchema.safeParse({
        status: "rejected",
        reject_reason: tooLong,
      }).success
    ).toBe(false);
  });
});

describe("VerifyCheckpointCompletionBodySchema", () => {
  it("matches the challenge-level verify schema for status + reason normalisation", () => {
    const out = VerifyCheckpointCompletionBodySchema.parse({
      status: "rejected",
      reject_reason: "  too short  ",
    });
    expect(out).toEqual({ status: "rejected", reject_reason: "too short" });
  });
});

describe("SubmitCompletionBodySchema", () => {
  it("accepts content + image_url + step + method", () => {
    const out = SubmitCompletionBodySchema.parse({
      content: "Did it",
      image_url: "https://blossom.example/x.png",
      step: 3,
      method: "creator_approval",
    });
    expect(out.content).toBe("Did it");
    expect(out.image_url).toBe("https://blossom.example/x.png");
    expect(out.step).toBe(3);
    expect(out.method).toBe("creator_approval");
  });

  it("normalises a missing content to null", () => {
    const out = SubmitCompletionBodySchema.parse({});
    expect(out.content).toBeNull();
  });

  it("rejects an unknown verification method", () => {
    expect(
      SubmitCompletionBodySchema.safeParse({ method: "telepathy" }).success
    ).toBe(false);
  });

  it("rejects a non-http(s) image_url scheme", () => {
    expect(
      SubmitCompletionBodySchema.safeParse({
        content: "ok",
        image_url: "javascript:alert(1)",
      }).success
    ).toBe(false);
  });

  it("rejects a non-integer step", () => {
    expect(
      SubmitCompletionBodySchema.safeParse({ step: 1.5 }).success
    ).toBe(false);
  });
});

describe("CompleteCheckpointBodySchema", () => {
  it("mirrors SubmitCompletionBodySchema for content / image / method", () => {
    const out = CompleteCheckpointBodySchema.parse({
      content: "done",
      image_url: "https://blossom.example/x.png",
      method: "automatic",
    });
    expect(out.content).toBe("done");
    expect(out.method).toBe("automatic");
  });

  it("normalises a missing content to null", () => {
    expect(CompleteCheckpointBodySchema.parse({}).content).toBeNull();
  });
});

describe("ListCompletionsQuerySchema", () => {
  it("accepts pending / approved / rejected", () => {
    expect(ListCompletionsQuerySchema.parse({ status: "pending" }).status).toBe("pending");
    expect(ListCompletionsQuerySchema.parse({ status: "approved" }).status).toBe("approved");
    expect(ListCompletionsQuerySchema.parse({ status: "rejected" }).status).toBe("rejected");
  });

  it("treats status as optional", () => {
    expect(ListCompletionsQuerySchema.parse({}).status).toBeUndefined();
  });

  it("rejects an unknown status value", () => {
    expect(
      ListCompletionsQuerySchema.safeParse({ status: "in_review" }).success
    ).toBe(false);
  });
});
