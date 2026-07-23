CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" text NOT NULL,
	"last_seen_at" text,
	"revoked_at" text
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"title" text NOT NULL,
	"city" text NOT NULL,
	"travel_date" text NOT NULL,
	"status" text NOT NULL,
	"photo_count" integer NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"photo_slot" integer,
	"layout_json" jsonb
);
--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_pages" ADD CONSTRAINT "memory_pages_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_installation_id_unique" ON "devices" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "devices_token_hash_idx" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "memories_device_updated_idx" ON "memories" USING btree ("device_id","updated_at");--> statement-breakpoint
CREATE INDEX "memory_pages_memory_position_idx" ON "memory_pages" USING btree ("memory_id","position");