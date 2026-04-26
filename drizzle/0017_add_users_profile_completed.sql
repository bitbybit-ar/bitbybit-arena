ALTER TABLE "users" ADD COLUMN "profile_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "profile_completed" = true WHERE "display_name" !~ '^Nostr [0-9a-f]{8}$';
