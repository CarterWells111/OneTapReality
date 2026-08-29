ALTER TABLE "shared_albums" ADD COLUMN "cover_object_key" text;
--> statement-breakpoint
ALTER TABLE "shared_albums" ADD COLUMN "cover_content_type" text;
--> statement-breakpoint
ALTER TABLE "shared_albums" ADD COLUMN "cover_byte_size" integer;
