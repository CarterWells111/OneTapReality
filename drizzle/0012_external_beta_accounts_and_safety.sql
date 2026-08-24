ALTER TABLE "users" ADD COLUMN "deletion_state" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" text;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deletion_state_check" CHECK ("deletion_state" in ('active', 'pending'));
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deletion_requested_at_check" CHECK (("deletion_state" = 'active' and "deletion_requested_at" is null) or ("deletion_state" = 'pending' and "deletion_requested_at" is not null));
--> statement-breakpoint
CREATE TABLE "account_deletion_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "session_id" text NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" text NOT NULL,
  "consumed_at" text,
  "failed_attempts" integer DEFAULT 0 NOT NULL,
  "created_at" text NOT NULL,
  CONSTRAINT "account_deletion_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "account_deletion_challenges_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "account_deletion_challenges_failed_attempts_check" CHECK ("failed_attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE INDEX "account_deletion_challenges_user_created_idx" ON "account_deletion_challenges" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "account_deletion_challenges_expires_idx" ON "account_deletion_challenges" USING btree ("expires_at", "id");
--> statement-breakpoint
CREATE TABLE "account_deletion_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "account_email" text,
  "state" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" text NOT NULL,
  "lease_until" text,
  "complete_by" text NOT NULL,
  "last_error_code" text,
  "support_notified_at" text,
  "completed_at" text,
  "created_at" text NOT NULL,
  CONSTRAINT "account_deletion_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "account_deletion_jobs_state_check" CHECK ("state" in ('pending', 'processing', 'completed')),
  CONSTRAINT "account_deletion_jobs_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "account_deletion_jobs_identity_check" CHECK (("state" = 'completed' and "user_id" is null and "account_email" is null and "completed_at" is not null) or ("state" in ('pending', 'processing') and "user_id" is not null and "account_email" is not null and "completed_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_jobs_user_open_unique" ON "account_deletion_jobs" ("user_id") WHERE "state" in ('pending', 'processing');
--> statement-breakpoint
CREATE INDEX "account_deletion_jobs_due_idx" ON "account_deletion_jobs" USING btree ("state", "next_attempt_at", "id");
--> statement-breakpoint
CREATE TABLE "account_deletion_media_objects" (
  "id" text PRIMARY KEY NOT NULL,
  "job_id" text NOT NULL,
  "object_key" text NOT NULL,
  CONSTRAINT "account_deletion_media_objects_job_id_account_deletion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."account_deletion_jobs"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_media_objects_job_object_unique" ON "account_deletion_media_objects" USING btree ("job_id", "object_key");
--> statement-breakpoint
CREATE TABLE "gift_content_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "gift_id" text NOT NULL,
  "reporter_user_id" text NOT NULL,
  "reason" text NOT NULL,
  "details" text,
  "snapshot_version" integer NOT NULL,
  "state" text DEFAULT 'open' NOT NULL,
  "disposition" text,
  "disposition_note" text,
  "disposed_at" text,
  "support_notified_at" text,
  "created_at" text NOT NULL,
  CONSTRAINT "gift_content_reports_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "gift_content_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "gift_content_reports_reason_check" CHECK ("reason" in ('sexual', 'harassment', 'hate', 'violence', 'spam', 'other')),
  CONSTRAINT "gift_content_reports_snapshot_version_check" CHECK ("snapshot_version" >= 1),
  CONSTRAINT "gift_content_reports_details_length_check" CHECK ("details" is null or char_length("details") <= 500),
  CONSTRAINT "gift_content_reports_disposition_note_length_check" CHECK ("disposition_note" is null or char_length("disposition_note") <= 500),
  CONSTRAINT "gift_content_reports_state_check" CHECK ("state" in ('open', 'resolved', 'dismissed')),
  CONSTRAINT "gift_content_reports_disposition_check" CHECK (("state" = 'open' and "disposition" is null and "disposed_at" is null) or ("state" in ('resolved', 'dismissed') and "disposition" in ('content_disabled', 'member_removed', 'no_violation') and "disposed_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_content_reports_reporter_snapshot_unique" ON "gift_content_reports" USING btree ("gift_id", "reporter_user_id", "snapshot_version");
--> statement-breakpoint
CREATE INDEX "gift_content_reports_open_created_idx" ON "gift_content_reports" USING btree ("state", "created_at", "id");
--> statement-breakpoint
CREATE INDEX "gift_content_reports_reporter_gift_idx" ON "gift_content_reports" USING btree ("reporter_user_id", "gift_id");
--> statement-breakpoint
CREATE TABLE "user_blocks" (
  "id" text PRIMARY KEY NOT NULL,
  "blocker_user_id" text NOT NULL,
  "blocker_email" text NOT NULL,
  "blocked_user_id" text,
  "blocked_email" text NOT NULL,
  "email_low" text NOT NULL,
  "email_high" text NOT NULL,
  "source_gift_id" text,
  "created_at" text NOT NULL,
  CONSTRAINT "user_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "user_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "user_blocks_source_gift_id_gifts_id_fk" FOREIGN KEY ("source_gift_id") REFERENCES "public"."gifts"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "user_blocks_distinct_email_check" CHECK ("blocker_email" <> "blocked_email" and "email_low" <> "email_high")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_blocks_email_pair_unique" ON "user_blocks" USING btree ("email_low", "email_high");
--> statement-breakpoint
CREATE INDEX "user_blocks_blocker_created_idx" ON "user_blocks" USING btree ("blocker_user_id", "created_at", "id");
--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_email_idx" ON "user_blocks" USING btree ("blocked_email", "created_at", "id");
--> statement-breakpoint
UPDATE "app_schema_meta" SET "version" = 12, "updated_at" = '2026-08-24T00:00:00.000Z' WHERE "key" = 'database';
