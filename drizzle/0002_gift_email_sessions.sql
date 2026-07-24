CREATE TABLE "gift_email_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" text NOT NULL,
  "consumed_at" text,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" text NOT NULL,
  "revoked_at" text,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gift_email_codes_email_created_idx" ON "gift_email_codes" USING btree ("email","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_sessions_token_hash_unique" ON "gift_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "gift_sessions_email_idx" ON "gift_sessions" USING btree ("email");
