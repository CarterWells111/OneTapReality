ALTER TABLE "auth_email_codes" VALIDATE CONSTRAINT "auth_email_codes_failed_attempts_check";--> statement-breakpoint
ALTER TABLE "auth_rate_limits" VALIDATE CONSTRAINT "auth_rate_limits_attempts_check";--> statement-breakpoint
ALTER TABLE "gifts" VALIDATE CONSTRAINT "gifts_status_check";--> statement-breakpoint
ALTER TABLE "gift_cards" VALIDATE CONSTRAINT "gift_cards_state_check";--> statement-breakpoint
ALTER TABLE "gift_cards" VALIDATE CONSTRAINT "gift_cards_gift_id_present_check";--> statement-breakpoint
ALTER TABLE "gift_members" VALIDATE CONSTRAINT "gift_members_role_check";--> statement-breakpoint
ALTER TABLE "gift_media_cleanup_jobs" VALIDATE CONSTRAINT "gift_media_cleanup_jobs_state_check";--> statement-breakpoint
ALTER TABLE "gift_media_cleanup_jobs" VALIDATE CONSTRAINT "gift_media_cleanup_jobs_attempts_check";--> statement-breakpoint
DROP TABLE "gift_email_codes";--> statement-breakpoint
DROP TABLE "gift_sessions";--> statement-breakpoint
INSERT INTO "app_schema_meta" ("key", "version", "updated_at")
VALUES ('database', 8, '2026-08-16T02:07:56.175Z')
ON CONFLICT ("key") DO UPDATE
SET "version" = EXCLUDED."version", "updated_at" = EXCLUDED."updated_at";
