import { getTableColumns, getTableName, sql } from "drizzle-orm";

import type { BackendDatabase } from "./client";
import * as schema from "./schema";
import { ApiError } from "../http/errors";

export const minimumSchemaVersion = 16;

// Current API and maintenance structures, including account deletion, content safety
// and recoverable publication receipts. Removed legacy auth tables are not required.
const requiredTables = [
  schema.appSchemaMeta, schema.appMaintenanceState,
  schema.users, schema.authEmailCodes, schema.authSessions, schema.authRateLimits,
  schema.accountDeletionChallenges, schema.accountDeletionJobs, schema.accountDeletionMediaObjects,
  schema.devices, schema.memories, schema.memoryPages,
  schema.gifts, schema.giftCards, schema.giftCardEvents, schema.giftMembers,
  schema.giftMemberActivations, schema.giftRelationshipTombstones, schema.giftContentReports, schema.userBlocks,
  schema.sharedAlbums, schema.sharedAlbumPages, schema.sharedAlbumMedia,
  schema.giftPublishSessions, schema.giftManagementRequests, schema.giftMediaCleanupJobs,
];
const requiredColumns = requiredTables.flatMap(table => {
  const tableName = getTableName(table);
  return Object.values(getTableColumns(table)).map(column => `${tableName}.${column.name}`);
});

function schemaNotReady(): ApiError {
  return new ApiError(503, "database_schema_outdated", "Database schema is not ready");
}

/** Readiness reads catalog/schema metadata only, without querying account or album contents. */
export async function requireDatabaseReady(db: BackendDatabase): Promise<number> {
  const columns = await db.execute<{ table_name: string; column_name: string }>(sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and table_name in (${sql.join(requiredTables.map(table => sql`${getTableName(table)}`), sql`, `)})
  `);
  const availableColumns = new Set(columns.rows.map(column => `${column.table_name}.${column.column_name}`));
  if (requiredColumns.some(column => !availableColumns.has(column))) throw schemaNotReady();

  const metadata = await db.execute<{ version: number }>(sql`
    select version from app_schema_meta where key = 'database' and version >= ${minimumSchemaVersion}
  `);
  const schemaVersion = Number(metadata.rows[0]?.version);
  if (!Number.isInteger(schemaVersion) || schemaVersion < minimumSchemaVersion) throw schemaNotReady();
  return schemaVersion;
}
