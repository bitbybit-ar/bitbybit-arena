import { BadRequestError } from "./errors";
import type { VerificationMethod } from "@/lib/types";

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
