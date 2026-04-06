// Shared TypeScript interfaces

export interface User {
  id: string;
  nostr_pubkey: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  about: string | null;
  lightning_address: string | null;
  locale: string;
  created_at: string;
}

export type ChallengeType =
  | "one_time"
  | "streak"
  | "competition"
  | "race"
  | "creative";

export type ChallengeStatus = "open" | "in_progress" | "completed" | "cancelled";

export type VerificationType =
  | "creator_approval"
  | "community_vote"
  | "automatic";

export type PrizeDistribution =
  | "first_to_complete"
  | "winner_takes_all"
  | "tiered"
  | "split"
  | "none";

export interface Challenge {
  id: string;
  creator_id: string;
  slug: string;
  title: string;
  description: string;
  image_url: string | null;
  type: ChallengeType;
  category: string | null;
  goal: number | null;
  unit: string | null;
  verification_type: VerificationType;
  prize_amount_sats: number;
  prize_distribution: PrizeDistribution | null;
  badge_name: string | null;
  badge_image_url: string | null;
  status: ChallengeStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  // Computed
  participant_count?: number;
  completion_count?: number;
}

export type CompletionStatus = "pending" | "approved" | "rejected";

export interface Completion {
  id: string;
  challenge_id: string;
  user_id: string;
  step: number | null;
  content: string | null;
  proof_url: string | null;
  proof_hash: string | null;
  status: CompletionStatus;
  reviewed_by: string | null;
  submitted_at: string;
}

export type PrizeStatus = "pending" | "paid" | "failed";

export interface Prize {
  id: string;
  challenge_id: string;
  winner_id: string;
  amount_sats: number;
  placement: string | null;
  payment_method: string | null;
  status: PrizeStatus;
  paid_at: string | null;
}

export interface Badge {
  id: string;
  challenge_id: string;
  user_id: string;
  badge_name: string;
  badge_image_url: string | null;
  awarded_at: string;
}

export interface Participant {
  id: string;
  challenge_id: string;
  user_id: string;
  progress: number;
  points: number;
  status: "active" | "completed" | "withdrawn";
  completed_at: string | null;
  joined_at: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
