-- Collapse reward_zap_mode into prize_distribution so zap payouts and
-- the "how is the prize distributed" dropdown use a single column.
-- Any challenge that has a reward_zap_mode set was created post-PR3
-- and has prize_distribution='none' (the default at the time), so the
-- UPDATE effectively moves the meaningful value into the kept column.
UPDATE "challenges" SET "prize_distribution" = "reward_zap_mode" WHERE "reward_zap_mode" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" DROP COLUMN "reward_zap_mode";
