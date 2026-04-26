/**
 * Unit tests for the verification-method helpers used by every
 * completion-submission route. Pure logic — no DB, no relays — so a
 * unit test gives us full coverage for the cross-field rule "if the
 * challenge advertises method X, the submission must claim X (or one
 * if there's only one)".
 */
import { describe, it, expect } from "vitest";
import {
  pickVerificationMethod,
  shouldAutoApprove,
} from "@/lib/api/verification-methods";
import { BadRequestError } from "@/lib/api/errors";

describe("shouldAutoApprove", () => {
  it("auto-approves the 'automatic' method regardless of who submitted", () => {
    expect(shouldAutoApprove("automatic", "creator-id", "anyone")).toBe(true);
  });

  it("auto-approves creator_approval when the submitter IS the creator", () => {
    expect(shouldAutoApprove("creator_approval", "u1", "u1")).toBe(true);
  });

  it("does not auto-approve creator_approval for a regular participant", () => {
    expect(shouldAutoApprove("creator_approval", "creator", "participant")).toBe(false);
  });

  it("does not auto-approve nostr_action or nostr_hashtag (caller verifies upstream)", () => {
    expect(shouldAutoApprove("nostr_action", "u1", "u1")).toBe(false);
    expect(shouldAutoApprove("nostr_hashtag", "u1", "u1")).toBe(false);
  });
});

describe("pickVerificationMethod", () => {
  it("returns the requested method when it is in the allowed set", () => {
    expect(
      pickVerificationMethod("nostr_action", ["nostr_action", "creator_approval"])
    ).toBe("nostr_action");
  });

  it("defaults to the only entry when the challenge advertises a single method", () => {
    expect(pickVerificationMethod(undefined, ["creator_approval"])).toBe(
      "creator_approval"
    );
    // A non-string `input` should still fall through to the single-default branch.
    expect(pickVerificationMethod(null, ["automatic"])).toBe("automatic");
  });

  it("throws a 400 when no method is configured", () => {
    expect(() => pickVerificationMethod("creator_approval", [])).toThrow(
      BadRequestError
    );
  });

  it("throws when the requested method is not in the allowed set", () => {
    expect(() =>
      pickVerificationMethod("nostr_hashtag", ["creator_approval", "nostr_action"])
    ).toThrow(BadRequestError);
  });

  it("throws when input is omitted and the challenge has multiple methods", () => {
    // Multiple methods + no `method` from the client → ambiguous, must 400.
    try {
      pickVerificationMethod(undefined, ["creator_approval", "nostr_action"]);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as Error).message).toMatch(/method must be one of/);
    }
  });

  it("rejects a non-string method input that doesn't trigger the single-default branch", () => {
    expect(() =>
      pickVerificationMethod(42, ["creator_approval", "nostr_action"])
    ).toThrow(BadRequestError);
  });
});
