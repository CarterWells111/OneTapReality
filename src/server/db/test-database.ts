import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "./schema";
import type { BackendDatabase } from "./client";

export function createBackendTestDatabase(): BackendDatabase {
  // jest-expo loses an in-memory libSQL schema across its async migration/query boundary;
  // an ignored per-test file preserves the same local libSQL behavior without shared state.
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return drizzle(createClient({ url: `file:./.data/backend-test-${suffix}.db` }), { schema });
}

export async function migrateBackendDatabase(db: BackendDatabase): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}
