ALTER TABLE "challenges" ADD COLUMN "tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;
--> statement-breakpoint
UPDATE "challenges" SET "tags" = ARRAY["category"] WHERE "category" IS NOT NULL AND "category" <> '';