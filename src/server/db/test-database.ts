import { migrate } from "drizzle-orm/node-postgres/migrator";
import { newDb } from "pg-mem";
import type { Pool } from "pg";

import { createBackendDatabase, type BackendDatabase } from "./client";

const supportedDeferredConstraintValidations = /(?:ALTER TABLE "auth_email_codes" VALIDATE CONSTRAINT "auth_email_codes_failed_attempts_check"|ALTER TABLE "auth_rate_limits" VALIDATE CONSTRAINT "auth_rate_limits_attempts_check"|ALTER TABLE "gifts" VALIDATE CONSTRAINT "gifts_status_check"|ALTER TABLE "gift_cards" VALIDATE CONSTRAINT "gift_cards_state_check"|ALTER TABLE "gift_cards" VALIDATE CONSTRAINT "gift_cards_gift_id_present_check"|ALTER TABLE "gift_members" VALIDATE CONSTRAINT "gift_members_role_check"|ALTER TABLE "gift_media_cleanup_jobs" VALIDATE CONSTRAINT "gift_media_cleanup_jobs_state_check"|ALTER TABLE "gift_media_cleanup_jobs" VALIDATE CONSTRAINT "gift_media_cleanup_jobs_attempts_check")/giu;
const supportedLegacyTableLock = 'LOCK TABLE "gift_email_codes", "gift_sessions" IN ACCESS EXCLUSIVE MODE;';
const supportedLegacyTableGuard = `DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "gift_email_codes") OR EXISTS (SELECT 1 FROM "gift_sessions") THEN
    RAISE EXCEPTION 'Legacy gift authentication tables must be empty';
  END IF;
END
$$;`;

export type BackendTestDatabase = {
  db: BackendDatabase;
  close: () => Promise<void>;
};

export function createBackendTestDatabase(options: { onQuery?: (query: string) => void } = {}): BackendTestDatabase {
  const memoryDatabase = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memoryDatabase.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  const query = pool.query.bind(pool);
  const queryForTest = query as (...args: unknown[]) => unknown;

  // Drizzle provides pg type parsers for parameterized queries. pg-mem intentionally
  // rejects that optional pg feature, so remove it only at the in-memory adapter boundary.
  pool.query = (async (config: unknown, values?: unknown[]) => {
    if (typeof config === "object" && config !== null) {
      const { types: _types, rowMode, ...supportedConfig } = config as Record<string, unknown>;
      const queryText = supportedConfig.text;
      if (typeof queryText === "string") {
        options.onQuery?.(queryText);
        if (/pg_advisory_xact_lock/iu.test(queryText)) {
          return { rows: [], rowCount: 1, command: "SELECT", fields: [] };
        }
        // pg-mem does not implement PostgreSQL's deferred constraint validation.
        // Remove only that clause at the in-memory adapter boundary.
        const normalizedQuery = queryText.trim();
        supportedConfig.text = normalizedQuery === supportedLegacyTableLock || normalizedQuery === supportedLegacyTableGuard
          ? "SELECT 1"
          : queryText
              .replace(/\s+NOT VALID/giu, "")
              .replace(supportedDeferredConstraintValidations, "SELECT 1")
              .replace(/\s+for update skip locked/giu, "");
      }
      const result = await queryForTest(supportedConfig, values) as {
        rows?: Record<string, unknown>[];
      };
      if (rowMode === "array" && result.rows) {
        return { ...result, rows: result.rows.map((row) => Object.values(row)) };
      }
      return result;
    }
    if (typeof config === "string") options.onQuery?.(config);
    return queryForTest(config, values);
  }) as Pool["query"];

  return {
    db: createBackendDatabase(pool),
    close: () => pool.end(),
  };
}

export async function migrateBackendDatabase(db: BackendDatabase): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}
