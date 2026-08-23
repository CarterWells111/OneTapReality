ALTER TABLE "shared_albums" ADD COLUMN "travel_date" text;
--> statement-breakpoint
UPDATE "app_schema_meta" SET "version" = 11, "updated_at" = '2026-08-23T00:00:00.000Z' WHERE "key" = 'database';
