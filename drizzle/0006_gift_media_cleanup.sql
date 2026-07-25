CREATE TABLE "gift_media_cleanup_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "gift_id" text NOT NULL,
  "object_key" text NOT NULL,
  "state" text NOT NULL,
  "attempts" integer NOT NULL,
  "next_attempt_at" text NOT NULL,
  "last_error" text,
  "completed_at" text,
  "created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_media_cleanup_jobs" ADD CONSTRAINT "gift_media_cleanup_jobs_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_media_cleanup_jobs_object_key_unique" ON "gift_media_cleanup_jobs" USING btree ("object_key");
--> statement-breakpoint
CREATE INDEX "gift_media_cleanup_jobs_due_idx" ON "gift_media_cleanup_jobs" USING btree ("state","next_attempt_at");
