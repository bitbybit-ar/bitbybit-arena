import { BadRequestError } from "./errors";
import type { VerificationMethod } from "@/lib/types";

/**
 * Decide whether a submitted proof should land directly as `approved`.
 *
 * - `automatic` verification trusts the submission on sight.
 * - `creator_approval` proofs from the challenge creator themselves
 *   auto-approve: no one else is empowered to judge them when the
 *   creator competes as a participant in their own challenge.
 * - Everything else waits for manual review (or relay verification
 *   handled upstream of this helper).
 */
export function shouldAutoApprove(
  selectedMethod: VerificationMethod,
  creatorId: string,
  submitterId: string
): boolean {
  if (selectedMethod === "automatic") return true;
  if (selectedMethod === "creator_approval" && creatorId === submitterId) {
    return true;
  }
  return false;
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
