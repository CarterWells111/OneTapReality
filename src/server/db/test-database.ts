import { migrate } from "drizzle-orm/node-postgres/migrator";
import { newDb } from "pg-mem";
import type { Pool } from "pg";

import { createBackendDatabase, type BackendDatabase } from "./client";

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
        supportedConfig.text = queryText
          .replace(/\s+NOT VALID/giu, "")
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
