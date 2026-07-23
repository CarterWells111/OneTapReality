import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

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

let cachedDatabase: BackendDatabase | undefined;

export function getServerDatabase(): BackendDatabase {
  cachedDatabase ??= createBackendDatabase(new Pool({ connectionString: getDatabaseUrl() }));
  return cachedDatabase;
}
