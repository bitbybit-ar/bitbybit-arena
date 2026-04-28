import type {
  Checkpoint,
  CheckpointCompletion,
  PrizeDistribution,
} from "@/lib/types";

export interface ChallengeDetail {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  verification_methods: string[];
  nostr_action_target_event_id: string | null;
  nostr_hashtag: string | null;
  checkpoint_mode: "none" | "sequential" | "parallel";
  goal: number | null;
  unit: string | null;
  tags: string[];
  badge_name: string | null;
  badge_image_url: string | null;
  badge_nostr_event_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  participant_count: number;
  completion_count: number;
  creator_id: string;
  slug: string;
  prize_amount_sats: number;
  prize_distribution: PrizeDistribution | null;
  zap_goal_event_id: string | null;
  rewards_paid_at: string | null;
  result_nostr_event_id: string | null;
  creator: {
    id: string;
    display_name: string;
    username: string;
    nostr_pubkey: string;
    lightning_address?: string;
  };
  checkpoints: Checkpoint[];
  my_checkpoint_completions: CheckpointCompletion[];
}

export interface RewardWinner {
  user_id: string;
  nostr_pubkey: string;
  display_name: string;
  // null when retained=true — no payout is owed to the winner.
  lightning_address: string | null;
  amount_sats: number;
  retained: boolean;
}

// A winner we're actually going to pay. Narrowed inside handleClaimReward
// so the zap loop doesn't have to re-check `lightning_address` for null.
export type PayableWinner = RewardWinner & {
  lightning_address: string;
  retained: false;
};

export interface CompletionItem {
  id: string;
  content: string | null;
  image_url: string | null;
  proof_event_id: string | null;
  status: string;
  submitted_at: string;
  user: {
    id: string;
    display_name: string;
    username: string;
    nostr_pubkey?: string;
    avatar_url?: string | null;
  };
}
