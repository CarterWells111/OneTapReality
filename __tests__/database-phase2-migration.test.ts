import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "drizzle/0014_database_phase2.sql"), "utf8");

describe("database phase-two migration", () => {
  it("locks both retired tables and refuses to delete non-empty data", () => {
    expect(migration).toContain('LOCK TABLE "gift_email_codes", "gift_sessions" IN ACCESS EXCLUSIVE MODE');
    expect(migration).toContain('EXISTS (SELECT 1 FROM "gift_email_codes")');
    expect(migration).toContain('EXISTS (SELECT 1 FROM "gift_sessions")');
    expect(migration).toContain("Legacy gift authentication tables must be empty");
  });

  it("validates the exact eight deferred constraints before dropping tables", () => {
    const validations = migration.match(/ALTER TABLE "[^"]+" VALIDATE CONSTRAINT "[^"]+"/gu) ?? [];
    expect(validations).toEqual([
      'ALTER TABLE "auth_email_codes" VALIDATE CONSTRAINT "auth_email_codes_failed_attempts_check"',
      'ALTER TABLE "auth_rate_limits" VALIDATE CONSTRAINT "auth_rate_limits_attempts_check"',
      'ALTER TABLE "gifts" VALIDATE CONSTRAINT "gifts_status_check"',
      'ALTER TABLE "gift_cards" VALIDATE CONSTRAINT "gift_cards_state_check"',
      'ALTER TABLE "gift_cards" VALIDATE CONSTRAINT "gift_cards_gift_id_present_check"',
      'ALTER TABLE "gift_members" VALIDATE CONSTRAINT "gift_members_role_check"',
      'ALTER TABLE "gift_media_cleanup_jobs" VALIDATE CONSTRAINT "gift_media_cleanup_jobs_state_check"',
      'ALTER TABLE "gift_media_cleanup_jobs" VALIDATE CONSTRAINT "gift_media_cleanup_jobs_attempts_check"',
    ]);
    expect(migration).not.toMatch(/\bCASCADE\b/u);
  });

  it("advances the application schema version after all destructive statements", () => {
    expect(migration).toContain("VALUES ('database', 14,");
    expect(migration.lastIndexOf("VALUES ('database', 14,")).toBeGreaterThan(migration.lastIndexOf('DROP TABLE "gift_sessions"'));
  });
});
