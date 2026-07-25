CREATE TABLE "users" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "created_at" text NOT NULL,
  "last_authenticated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_email_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" text NOT NULL,
  "consumed_at" text,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" text NOT NULL,
  "revoked_at" text,
  "created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "auth_email_codes_email_created_idx" ON "auth_email_codes" USING btree ("email","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");
