ALTER TABLE "gift_publish_sessions" ADD COLUMN "completed_album_id" text;
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ADD COLUMN "completed_album_version" integer;
--> statement-breakpoint
UPDATE "app_schema_meta" SET "version" = 16, "updated_at" = '2026-09-06T00:00:00.000Z' WHERE "key" = 'database';
