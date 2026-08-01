CREATE TABLE "app_maintenance_state" (
	"id" text PRIMARY KEY NOT NULL,
	"lease_token" text,
	"lease_until" text,
	"last_started_at" text,
	"last_completed_at" text,
	"last_error_code" text
);
--> statement-breakpoint
CREATE TABLE "app_schema_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"scope_hash" text PRIMARY KEY NOT NULL,
	"window_started_at" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_email_codes" ADD COLUMN "failed_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "gift_media_cleanup_jobs" ADD COLUMN "lease_until" text;
--> statement-breakpoint
DROP INDEX "gift_cards_state_created_idx";
--> statement-breakpoint
DROP INDEX "gift_media_cleanup_jobs_due_idx";
--> statement-breakpoint
CREATE INDEX "auth_email_codes_expires_idx" ON "auth_email_codes" USING btree ("expires_at","id");
--> statement-breakpoint
CREATE INDEX "auth_rate_limits_expires_idx" ON "auth_rate_limits" USING btree ("expires_at","scope_hash");
--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at","id");
--> statement-breakpoint
CREATE INDEX "auth_sessions_revoked_idx" ON "auth_sessions" USING btree ("revoked_at","id");
--> statement-breakpoint
CREATE INDEX "gift_cards_state_expires_idx" ON "gift_cards" USING btree ("state","expires_at","id");
--> statement-breakpoint
CREATE INDEX "gift_media_cleanup_jobs_due_idx" ON "gift_media_cleanup_jobs" USING btree ("state","next_attempt_at","id");
--> statement-breakpoint
CREATE INDEX "gift_media_cleanup_jobs_terminal_idx" ON "gift_media_cleanup_jobs" USING btree ("state","completed_at","id");
--> statement-breakpoint
CREATE INDEX "gift_members_email_role_gift_idx" ON "gift_members" USING btree ("email","role","gift_id");
--> statement-breakpoint
CREATE INDEX "gift_publish_sessions_expires_idx" ON "gift_publish_sessions" USING btree ("expires_at","id");
--> statement-breakpoint
CREATE INDEX "gift_publish_sessions_completed_idx" ON "gift_publish_sessions" USING btree ("completed_at","id");
--> statement-breakpoint
ALTER TABLE "auth_email_codes" ADD CONSTRAINT "auth_email_codes_failed_attempts_check" CHECK ("failed_attempts" between 0 and 5) NOT VALID;
--> statement-breakpoint
ALTER TABLE "auth_rate_limits" ADD CONSTRAINT "auth_rate_limits_attempts_check" CHECK ("attempts" >= 0) NOT VALID;
--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_status_check" CHECK ("status" in ('initializing', 'unclaimed', 'bound', 'disabled')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_state_check" CHECK ("state" in ('initializing', 'active', 'retired')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_gift_id_present_check" CHECK ("gift_id" is not null) NOT VALID;
--> statement-breakpoint
ALTER TABLE "gift_members" ADD CONSTRAINT "gift_members_role_check" CHECK ("role" in ('owner', 'viewer')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "gift_media_cleanup_jobs" ADD CONSTRAINT "gift_media_cleanup_jobs_state_check" CHECK ("state" in ('pending', 'processing', 'completed', 'dead_letter')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "gift_media_cleanup_jobs" ADD CONSTRAINT "gift_media_cleanup_jobs_attempts_check" CHECK ("attempts" >= 0) NOT VALID;
--> statement-breakpoint
INSERT INTO "app_schema_meta" ("key", "version", "updated_at") VALUES ('database', 7, '2026-08-01T00:00:00.000Z');
