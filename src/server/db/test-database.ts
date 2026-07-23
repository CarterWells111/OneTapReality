import { migrate } from "drizzle-orm/node-postgres/migrator";
import { newDb } from "pg-mem";
import type { Pool } from "pg";

import { createBackendDatabase, type BackendDatabase } from "./client";

export type BackendTestDatabase = {
  db: BackendDatabase;
  close: () => Promise<void>;
};

export function createBackendTestDatabase(): BackendTestDatabase {
  const memoryDatabase = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memoryDatabase.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  const query = pool.query.bind(pool);
  const queryForTest = query as (...args: unknown[]) => unknown;

  // Drizzle provides pg type parsers for parameterized queries. pg-mem intentionally
  // rejects that optional pg feature, so remove it only at the in-memory adapter boundary.
  pool.query = ((config: unknown, values?: unknown[]) => {
    if (typeof config === "object" && config !== null && "types" in config) {
      const { types: _types, ...supportedConfig } = config;
      return queryForTest(supportedConfig, values);
    }
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
