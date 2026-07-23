import type { Client, Config } from "@libsql/client";
import { createClient as createHttpClient } from "@libsql/client/http";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql/http";
import { createRequire } from "node:module";
import path from "node:path";

import * as schema from "./schema";

export type BackendDatabase = LibSQLDatabase<typeof schema>;

type DatabaseEnvironment = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
};

function createNodeClient(config: Config): Client {
  const requireFromProject = createRequire(path.join(process.cwd(), "package.json"));
  const nodeClient = requireFromProject("@libsql/client") as typeof import("@libsql/client");
  return nodeClient.createClient(config);
}

export function createClientFromEnvironment(
  environment: DatabaseEnvironment = process.env as DatabaseEnvironment,
): Client {
  const url = environment.TURSO_DATABASE_URL ?? "file:./.data/backend.db";
  const authToken = environment.TURSO_AUTH_TOKEN;
  const config = authToken ? { url, authToken } : { url };
  return url.startsWith("file:") ? createNodeClient(config) : createHttpClient(config);
}

export function createBackendDatabase(client: Client): BackendDatabase {
  return drizzle(client, { schema });
}

let cachedDatabase: BackendDatabase | undefined;

export function getServerDatabase(): BackendDatabase {
  cachedDatabase ??= createBackendDatabase(createClientFromEnvironment());
  return cachedDatabase;
}
