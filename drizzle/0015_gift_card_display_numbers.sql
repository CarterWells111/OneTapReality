CREATE SEQUENCE "gift_cards_display_number_seq" AS integer START WITH 1 INCREMENT BY 1 NO CYCLE;
--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "display_number" integer;
--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "name" text;
--> statement-breakpoint
UPDATE "gift_cards" SET "display_number" = nextval('gift_cards_display_number_seq') WHERE "display_number" IS NULL;
--> statement-breakpoint
ALTER TABLE "gift_cards" ALTER COLUMN "display_number" SET DEFAULT nextval('gift_cards_display_number_seq');
--> statement-breakpoint
ALTER TABLE "gift_cards" ALTER COLUMN "display_number" SET NOT NULL;
--> statement-breakpoint
ALTER SEQUENCE "gift_cards_display_number_seq" OWNED BY "gift_cards"."display_number";
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_display_number_unique" ON "gift_cards" USING btree ("display_number");
--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_display_number_positive_check" CHECK ("display_number" > 0);
--> statement-breakpoint
UPDATE "app_schema_meta" SET "version" = 15, "updated_at" = '2026-09-05T00:00:00.000Z' WHERE "key" = 'database';
