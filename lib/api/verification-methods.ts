import { BadRequestError } from "./errors";
import type { VerificationMethod } from "@/lib/types";

/**
 * Decide whether a submitted proof should land directly as `approved`.
 *
 * Rules, given the four possible methods (`automatic`, `creator_approval`,
 * `nostr_action`, `nostr_hashtag`) and the schema constraint that
 * `automatic` is exclusive (can't coexist with anything else):
 *
 * - `automatic` → always auto-approve (honor system).
 * - The creator submitting their own proof on a challenge that lists
 *   `creator_approval` auto-approves regardless of which method ran —
 *   no one else is empowered to judge them.
 * - A pure Nostr method (`nostr_action` / `nostr_hashtag`) auto-approves
 *   when the configured set has *no* `creator_approval`. When the
 *   creator wants manual review on top of the Nostr proof, the proof
 *   verifies but the row lands `pending` for the creator to approve.
 * - Anything else (manual `creator_approval` proof from a regular
 *   participant) waits for review.
 */
export function decideAutoApprove(
  selectedMethod: VerificationMethod,
  allowedMethods: VerificationMethod[],
  creatorId: string,
  submitterId: string
): boolean {
  if (selectedMethod === "automatic") return true;
  if (
    creatorId === submitterId &&
    allowedMethods.includes("creator_approval")
  ) {
    return true;
  }
  if (selectedMethod === "creator_approval") return false;
  // Nostr method: auto-approve unless the creator also asked for manual
  // review on top.
  return !allowedMethods.includes("creator_approval");
}

/**
 * Pick which verification method a completion submission should run.
 *
 * - If the client passed a `method` string and it's in the allowed set, use it.
 * - Otherwise, if the challenge/checkpoint has exactly one method, default to
 *   it (backward-compat with single-method challenges).
 * - Otherwise, throw a 400 so the client knows it must disambiguate.
 */
export function pickVerificationMethod(
  input: unknown,
  allowed: VerificationMethod[]
): VerificationMethod {
  if (!allowed || allowed.length === 0) {
    throw new BadRequestError("No verification methods configured");
  }
  if (typeof input === "string" && allowed.includes(input as VerificationMethod)) {
    return input as VerificationMethod;
  }
  if (allowed.length === 1) {
    return allowed[0];
  }
  throw new BadRequestError(
    `method must be one of: ${allowed.join(", ")}`
  );
}
