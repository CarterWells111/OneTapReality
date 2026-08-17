ALTER TABLE "gift_members" DROP CONSTRAINT "gift_members_role_check";
--> statement-breakpoint
ALTER TABLE "gift_members" ADD CONSTRAINT "gift_members_role_check" CHECK ("role" in ('owner', 'viewer', 'editor'));
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ADD COLUMN "member_id" text;
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ADD COLUMN "base_version" integer;
--> statement-breakpoint
UPDATE "gift_publish_sessions" SET "base_version" = 0 WHERE "base_version" IS NULL;
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ALTER COLUMN "base_version" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ALTER COLUMN "base_version" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ADD COLUMN "actor_user_id" text;
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ADD CONSTRAINT "gift_publish_sessions_member_id_gift_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gift_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gift_publish_sessions" ADD CONSTRAINT "gift_publish_sessions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gift_members" ADD CONSTRAINT "gift_members_gift_id_id_unique" UNIQUE ("gift_id", "id");
--> statement-breakpoint
CREATE TABLE "gift_management_requests" (
 "id" text PRIMARY KEY NOT NULL, "gift_id" text NOT NULL, "requester_member_id" text NOT NULL,
 "action" text NOT NULL, "target_email" text, "target_role" text, "status" text NOT NULL,
 "created_at" text NOT NULL, "decided_at" text,
 CONSTRAINT "gift_management_requests_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade,
 CONSTRAINT "gift_management_requests_gift_requester_member_fk" FOREIGN KEY ("gift_id", "requester_member_id") REFERENCES "public"."gift_members"("gift_id", "id") ON DELETE cascade,
 CONSTRAINT "gift_management_requests_action_check" CHECK ("action" in ('delete_album', 'remove_member', 'change_member_role')),
 CONSTRAINT "gift_management_requests_status_check" CHECK ("status" in ('pending', 'approved', 'rejected')),
 CONSTRAINT "gift_management_requests_target_role_check" CHECK ("target_role" is null or "target_role" in ('viewer', 'editor')),
 CONSTRAINT "gift_management_requests_action_target_check" CHECK (("action" = 'delete_album' and "target_email" is null and "target_role" is null) or ("action" = 'remove_member' and "target_email" is not null and "target_role" is null) or ("action" = 'change_member_role' and "target_email" is not null and "target_role" is not null)),
 CONSTRAINT "gift_management_requests_decision_time_check" CHECK (("status" = 'pending' and "decided_at" is null) or ("status" in ('approved', 'rejected') and "decided_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "gift_management_requests_gift_status_created_idx" ON "gift_management_requests" USING btree ("gift_id","status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_management_requests_pending_unique" ON "gift_management_requests" ("gift_id","action",coalesce("target_email", ''),coalesce("target_role", '')) WHERE "status" = 'pending';
--> statement-breakpoint
UPDATE "app_schema_meta" SET "version" = 10, "updated_at" = '2026-08-16T00:00:00.000Z' WHERE "key" = 'database';
