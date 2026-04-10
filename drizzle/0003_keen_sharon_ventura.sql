CREATE TABLE "challenge_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"verification_type" varchar(20) DEFAULT 'creator_approval' NOT NULL,
	"nostr_action_target_event_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkpoint_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"proof_event_id" varchar(64),
	"content" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "checkpoint_mode" varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_checkpoints" ADD CONSTRAINT "challenge_checkpoints_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_completions" ADD CONSTRAINT "checkpoint_completions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_completions" ADD CONSTRAINT "checkpoint_completions_checkpoint_id_challenge_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."challenge_checkpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkpoints_challenge_idx" ON "challenge_checkpoints" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_challenge_order_idx" ON "challenge_checkpoints" USING btree ("challenge_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoint_completions_unique_idx" ON "checkpoint_completions" USING btree ("participant_id","checkpoint_id");--> statement-breakpoint
CREATE INDEX "checkpoint_completions_checkpoint_idx" ON "checkpoint_completions" USING btree ("checkpoint_id");