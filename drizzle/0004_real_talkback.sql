ALTER TABLE "challenges" ADD COLUMN "zap_goal_event_id" varchar(64);--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "reward_zap_mode" varchar(20);--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "rewards_paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "completions" ADD COLUMN "reward_zap_receipt_id" varchar(64);