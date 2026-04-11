-- Add the new array column for verification methods and the hashtag target
-- column, backfill from the single-value `verification_type` column, then drop
-- the old column on both challenges and challenge_checkpoints.

ALTER TABLE "challenges"
  ADD COLUMN "verification_methods" text[] DEFAULT ARRAY['creator_approval']::text[] NOT NULL,
  ADD COLUMN "nostr_hashtag" varchar(50);
--> statement-breakpoint

ALTER TABLE "challenge_checkpoints"
  ADD COLUMN "verification_methods" text[] DEFAULT ARRAY['creator_approval']::text[] NOT NULL,
  ADD COLUMN "nostr_hashtag" varchar(50);
--> statement-breakpoint

UPDATE "challenges" SET "verification_methods" = ARRAY["verification_type"];
--> statement-breakpoint

UPDATE "challenge_checkpoints" SET "verification_methods" = ARRAY["verification_type"];
--> statement-breakpoint

ALTER TABLE "challenges" DROP COLUMN "verification_type";
--> statement-breakpoint

ALTER TABLE "challenge_checkpoints" DROP COLUMN "verification_type";
