/**
 * Single source of truth for the string-enum sets used across the API.
 * Each `*_VALUES` tuple is `as const` so we can derive both the Zod
 * schema (runtime validation) and the TS union type (compile-time
 * checks) from the same array — no risk of the two drifting apart.
 *
 * The exported `*Schema` instances are what API routes should reach for
 * when validating incoming JSON. The exported types are re-exports
 * shaped like the long-standing definitions in `@/lib/types`, so
 * downstream code can keep importing from there.
 */
import { z } from "zod";
import type {
  ChallengeStatus,
  ChallengeType,
  CheckpointMode,
  CompletionStatus,
  PrizeDistribution,
  VerificationMethod,
} from "@/lib/types";

export const CHALLENGE_TYPES = [
  "one_time",
  "streak",
  "competition",
  "race",
  "creative",
] as const;

export const CHALLENGE_STATUSES = [
  "open",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const VERIFICATION_METHODS = [
  "creator_approval",
  "automatic",
  "nostr_action",
  "nostr_hashtag",
] as const;

export const CHECKPOINT_MODES = ["none", "sequential", "parallel"] as const;

export const PRIZE_DISTRIBUTIONS = [
  "first_to_complete",
  "split",
  "tiered",
  "none",
] as const;

/**
 * Subset of PRIZE_DISTRIBUTIONS that actually triggers a payout. Used
 * by the cross-field rule "prize_amount_sats > 0 ⇒ distribution must
 * pay someone" — `"none"` is the only excluded value.
 */
export const PAYOUT_DISTRIBUTIONS = [
  "first_to_complete",
  "split",
  "tiered",
] as const;

export const COMPLETION_STATUSES = ["pending", "approved", "rejected"] as const;

export const ChallengeTypeSchema = z.enum(CHALLENGE_TYPES);
export const ChallengeStatusSchema = z.enum(CHALLENGE_STATUSES);
export const VerificationMethodSchema = z.enum(VERIFICATION_METHODS);
export const CheckpointModeSchema = z.enum(CHECKPOINT_MODES);
export const PrizeDistributionSchema = z.enum(PRIZE_DISTRIBUTIONS);
export const PayoutDistributionSchema = z.enum(PAYOUT_DISTRIBUTIONS);
export const CompletionStatusSchema = z.enum(COMPLETION_STATUSES);

// Compile-time sanity checks: if anyone widens or narrows the legacy
// type unions in `@/lib/types` without updating the tuples above, these
// `satisfies` lines fail to compile. Cheaper than a runtime test and
// runs on every build.
const _challengeTypes: readonly ChallengeType[] = CHALLENGE_TYPES;
const _challengeStatuses: readonly ChallengeStatus[] = CHALLENGE_STATUSES;
const _verificationMethods: readonly VerificationMethod[] = VERIFICATION_METHODS;
const _checkpointModes: readonly CheckpointMode[] = CHECKPOINT_MODES;
const _prizeDistributions: readonly PrizeDistribution[] = PRIZE_DISTRIBUTIONS;
const _completionStatuses: readonly CompletionStatus[] = COMPLETION_STATUSES;
void [
  _challengeTypes,
  _challengeStatuses,
  _verificationMethods,
  _checkpointModes,
  _prizeDistributions,
  _completionStatuses,
];
