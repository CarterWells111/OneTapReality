CREATE TABLE "gift_cards" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "state" text NOT NULL,
  "gift_id" text,
  "note" text,
  "created_by_email" text NOT NULL,
  "expires_at" text,
  "activated_at" text,
  "retired_at" text,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_card_events" (
  "id" text PRIMARY KEY NOT NULL,
  "card_id" text NOT NULL,
  "kind" text NOT NULL,
  "actor_email" text NOT NULL,
  "metadata_json" jsonb,
  "created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gift_card_events" ADD CONSTRAINT "gift_card_events_card_id_gift_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."gift_cards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_code_unique" ON "gift_cards" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_gift_unique" ON "gift_cards" USING btree ("gift_id");
--> statement-breakpoint
CREATE INDEX "gift_cards_state_created_idx" ON "gift_cards" USING btree ("state","created_at");
--> statement-breakpoint
CREATE INDEX "gift_card_events_card_created_idx" ON "gift_card_events" USING btree ("card_id","created_at");
