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
UPDATE "app_schema_meta" SET "version" = 12, "updated_at" = '2026-08-24T00:00:00.000Z' WHERE "key" = 'database';
