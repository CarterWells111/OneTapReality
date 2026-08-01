import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

export type BackendDatabase = NodePgDatabase<typeof schema>;

type DatabaseEnvironment = {
  DATABASE_URL?: string;
};

export function getDatabaseUrl(
  environment: DatabaseEnvironment = process.env as DatabaseEnvironment,
): string {
  const url = environment.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

export function createBackendDatabase(client: Pool): BackendDatabase {
  return drizzle({ client, schema });
}

export function getDatabasePoolConfig(connectionString: string): PoolConfig {
  return {
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  };
}

let cachedDatabase: BackendDatabase | undefined;
let cachedPool: Pool | undefined;

export async function closeServerDatabase(): Promise<void> {
  const pool = cachedPool;
  cachedDatabase = undefined;
  cachedPool = undefined;
  if (pool) await pool.end();
}

export function getServerDatabase(): BackendDatabase {
  if (!cachedDatabase) {
    cachedPool = new Pool(getDatabasePoolConfig(getDatabaseUrl()));
    cachedDatabase = createBackendDatabase(cachedPool);
  }
  return cachedDatabase;
}

const databaseCloserKey = Symbol.for("onetap.closeServerDatabase");
(globalThis as typeof globalThis & { [databaseCloserKey]?: () => Promise<void> })[databaseCloserKey] = closeServerDatabase;
