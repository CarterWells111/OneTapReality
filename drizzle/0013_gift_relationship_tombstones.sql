CREATE TABLE "gift_relationship_tombstones" (
  "id" text PRIMARY KEY NOT NULL,
  "gift_id" text NOT NULL,
  "email" text NOT NULL,
  "user_id" text,
  "created_at" text NOT NULL,
  CONSTRAINT "gift_relationship_tombstones_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "gift_relationship_tombstones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_relationship_tombstones_gift_email_unique" ON "gift_relationship_tombstones" USING btree ("gift_id", "email");
--> statement-breakpoint
CREATE INDEX "gift_relationship_tombstones_user_gift_idx" ON "gift_relationship_tombstones" USING btree ("user_id", "gift_id");
--> statement-breakpoint
CREATE INDEX "gift_relationship_tombstones_email_gift_idx" ON "gift_relationship_tombstones" USING btree ("email", "gift_id");
--> statement-breakpoint
UPDATE "app_schema_meta" SET "version" = 13, "updated_at" = '2026-08-24T00:00:00.000Z' WHERE "key" = 'database';
