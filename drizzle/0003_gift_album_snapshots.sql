CREATE TABLE "shared_album_pages" (
  "id" text PRIMARY KEY NOT NULL,
  "shared_album_id" text NOT NULL,
  "position" integer NOT NULL,
  "page_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_album_media" (
  "id" text PRIMARY KEY NOT NULL,
  "shared_album_id" text NOT NULL,
  "position" integer NOT NULL,
  "object_key" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_publish_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "gift_id" text NOT NULL,
  "owner_email" text NOT NULL,
  "payload_json" jsonb NOT NULL,
  "expires_at" text NOT NULL,
  "completed_at" text,
  "created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_album_pages" ADD CONSTRAINT "shared_album_pages_shared_album_id_shared_albums_id_fk" FOREIGN KEY ("shared_album_id") REFERENCES "public"."shared_albums"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shared_album_media" ADD CONSTRAINT "shared_album_media_shared_album_id_shared_albums_id_fk" FOREIGN KEY ("shared_album_id") REFERENCES "public"."shared_albums"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ADD CONSTRAINT "gift_publish_sessions_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "shared_album_pages_album_position_unique" ON "shared_album_pages" USING btree ("shared_album_id", "position");
--> statement-breakpoint
CREATE UNIQUE INDEX "shared_album_media_object_key_unique" ON "shared_album_media" USING btree ("object_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "shared_album_media_album_position_unique" ON "shared_album_media" USING btree ("shared_album_id", "position");
--> statement-breakpoint
CREATE INDEX "gift_publish_sessions_gift_expires_idx" ON "gift_publish_sessions" USING btree ("gift_id", "expires_at");
