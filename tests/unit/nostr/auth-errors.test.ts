import { describe, it, expect } from "vitest";
import {
  isSignerCancellation,
  loginError,
  reSignInError,
} from "@/lib/nostr/auth-errors";

describe("loginError / reSignInError factories", () => {
  it("loginError tags the error with the 'login' namespace", () => {
    expect(loginError("no_extension")).toEqual({
      namespace: "login",
      key: "no_extension",
    });
  });

  it("reSignInError tags the error with the 'reSignIn' namespace", () => {
    expect(reSignInError("mismatch")).toEqual({
      namespace: "reSignIn",
      key: "mismatch",
    });
  });
});

describe("isSignerCancellation", () => {
  it("returns false for non-Error inputs", () => {
    expect(isSignerCancellation("rejected")).toBe(false);
    expect(isSignerCancellation(null)).toBe(false);
    expect(isSignerCancellation(undefined)).toBe(false);
    expect(isSignerCancellation({ message: "rejected" })).toBe(false);
  });

  it("returns true for our re-sign-in sentinel messages", () => {
    expect(isSignerCancellation(new Error("re_sign_in_cancelled"))).toBe(true);
    expect(isSignerCancellation(new Error("re_sign_in_superseded"))).toBe(true);
  });

  it("returns true for messages that look like a wallet cancel (case-insensitive)", () => {
    expect(isSignerCancellation(new Error("User rejected the request"))).toBe(true);
    expect(isSignerCancellation(new Error("DENIED by user"))).toBe(true);
    expect(isSignerCancellation(new Error("operation was cancelled"))).toBe(true);
    expect(isSignerCancellation(new Error("The popup was canceled"))).toBe(true);
  });

  it("returns false for unrelated error messages", () => {
    expect(isSignerCancellation(new Error("network timeout"))).toBe(false);
    expect(isSignerCancellation(new Error(""))).toBe(false);
  });
});
