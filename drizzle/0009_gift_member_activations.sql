CREATE TABLE "gift_member_activations" (
	"member_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"activated_at" text NOT NULL,
	CONSTRAINT "gift_member_activations_member_id_gift_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gift_members"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "gift_member_activations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "gift_member_activations_user_member_idx" ON "gift_member_activations" USING btree ("user_id","member_id");
--> statement-breakpoint
UPDATE "app_schema_meta" SET "version" = 9, "updated_at" = '2026-08-16T00:00:00.000Z' WHERE "key" = 'database';
