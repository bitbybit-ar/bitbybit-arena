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
  notification_prefs: NotificationPrefs;
  created_at: string;
}

// Partial map — missing or `true` keys mean enabled, `false` means muted.
export type NotificationPrefs = Partial<Record<NotificationType, boolean>>;

export const NOTIFICATION_TYPES: NotificationType[] = [
  "challenge_joined",
  "completion_submitted",
  "completion_verified",
  "checkpoint_submitted",
  "checkpoint_verified",
  "prize_awarded",
  "badge_earned",
];

export type ChallengeType =
  | "one_time"
  | "streak"
  | "competition"
  | "race"
  | "creative";

export type ChallengeStatus = "open" | "in_progress" | "completed" | "cancelled";

export type VerificationMethod =
  | "creator_approval"
  | "automatic"
  | "nostr_action"
  | "nostr_hashtag";

export type CheckpointMode = "none" | "sequential" | "parallel";

export type PrizeDistribution =
  | "first_to_complete"
  | "split"
  | "tiered"
  | "none";

export interface Challenge {
  id: string;
  creator_id: string;
  slug: string;
  title: string;
  description: string;
  image_url: string | null;
  type: ChallengeType;
  tags: string[];
  goal: number | null;
  unit: string | null;
  verification_methods: VerificationMethod[];
  nostr_action_target_event_id: string | null;
  nostr_hashtag: string | null;
  checkpoint_mode: CheckpointMode;
  zap_goal_event_id: string | null;
  rewards_paid_at: string | null;
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
  creator?: User;
}

export type CompletionStatus = "pending" | "approved" | "rejected";

export interface Completion {
  id: string;
  challenge_id: string;
  user_id: string;
  step: number | null;
  content: string | null;
  image_url: string | null;
  proof_event_id: string | null;
  reward_zap_receipt_id: string | null;
  status: CompletionStatus;
  reviewed_by: string | null;
  submitted_at: string;
  // Computed
  user?: User;
}

export interface Badge {
  id: string;
  challenge_id: string;
  user_id: string;
  badge_name: string;
  badge_image_url: string | null;
  awarded_at: string;
}

export interface Checkpoint {
  id: string;
  challenge_id: string;
  order: number;
  title: string;
  description: string | null;
  verification_methods: VerificationMethod[];
  nostr_action_target_event_id: string | null;
  nostr_hashtag: string | null;
}

export interface CheckpointCompletion {
  id: string;
  participant_id: string;
  checkpoint_id: string;
  proof_event_id: string | null;
  content: string | null;
  status: CompletionStatus;
  completed_at: string | null;
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
  // Computed
  user?: User;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type NotificationType =
  | "challenge_joined"
  | "completion_submitted"
  | "completion_verified"
  | "checkpoint_submitted"
  | "checkpoint_verified"
  | "prize_awarded"
  | "badge_earned";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
