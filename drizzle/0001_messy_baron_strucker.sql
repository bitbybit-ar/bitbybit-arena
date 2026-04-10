ALTER TABLE "completions" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "nostr_action_target_event_id" varchar(64);--> statement-breakpoint
ALTER TABLE "completions" ADD COLUMN "proof_event_id" varchar(64);