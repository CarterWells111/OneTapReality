CREATE TABLE "gifts" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "status" text NOT NULL,
  "created_at" text NOT NULL,
  "claimed_at" text,
  "disabled_at" text
);
--> statement-breakpoint
CREATE TABLE "gift_members" (
  "id" text PRIMARY KEY NOT NULL,
  "gift_id" text NOT NULL,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_albums" (
  "id" text PRIMARY KEY NOT NULL,
  "gift_id" text NOT NULL,
  "source_memory_id" text NOT NULL,
  "title" text NOT NULL,
  "published_at" text NOT NULL,
  "version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_members" ADD CONSTRAINT "gift_members_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shared_albums" ADD CONSTRAINT "shared_albums_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "gifts_token_hash_unique" ON "gifts" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_members_gift_email_unique" ON "gift_members" USING btree ("gift_id", "email");
--> statement-breakpoint
CREATE UNIQUE INDEX "shared_albums_gift_unique" ON "shared_albums" USING btree ("gift_id");
