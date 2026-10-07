import { sql } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";

import { GET as health } from "../src/app/api/health+api";
import { createBackendTestDatabase, migrateBackendDatabase } from "../src/server/db/test-database";

let mockCurrentDb: ReturnType<typeof createBackendTestDatabase>["db"];
jest.mock("../src/server/db/client", () => ({
  ...jest.requireActual("../src/server/db/client"), getServerDatabase: () => mockCurrentDb,
}));

async function migrateThrough(version: number) {
  const files = readdirSync("drizzle").filter(file => /^\d{4}_.*\.sql$/u.test(file) && Number(file.slice(0, 4)) <= version).sort();
  for (const file of files) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean);
    for (const statement of statements) await mockCurrentDb.execute(sql.raw(statement));
  }
}

async function expectOutdated() {
  const response = await health();
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
    error: { code: "database_schema_outdated", message: "Database schema is not ready" },
  });
}

describe("P1 readiness on current main's real Schema 16", () => {
  let close: () => Promise<void>;
  const originalFreeze = process.env.API_WRITE_FREEZE;

  beforeEach(() => {
    const database = createBackendTestDatabase();
    mockCurrentDb = database.db;
    close = database.close;
    delete process.env.API_WRITE_FREEZE;
  });
  afterEach(async () => {
    if (originalFreeze === undefined) delete process.env.API_WRITE_FREEZE; else process.env.API_WRITE_FREEZE = originalFreeze;
    await close();
  });

  it.each([9, 15])("rejects the actual migration set only through Schema %i", async version => {
    await migrateThrough(version);
    await expectOutdated();
  });

  it.each([9, 15])("rejects an incomplete Schema %i with forged version 16 metadata", async version => {
    await migrateThrough(version);
    await mockCurrentDb.execute(sql`update app_schema_meta set version = 16 where key = 'database'`);
    await expectOutdated();
  });

  it.each([[undefined, false], ["true", true], ["TRUE", false]] as const)("accepts complete Schema 16 and preserves writeFreeze for %s", async (freeze, expected) => {
    await migrateBackendDatabase(mockCurrentDb);
    if (freeze !== undefined) process.env.API_WRITE_FREEZE = freeze;
    const response = await health();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "onetapreality-api", contractVersion: 1, database: "ok", schemaVersion: 16, writeFreeze: expected,
    });
    const legacy = await mockCurrentDb.execute(sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('gift_email_codes', 'gift_sessions')`);
    expect(legacy.rows).toEqual([]);
  });

  it("rejects a database without schema metadata", async () => { await expectOutdated(); });

  it("rejects a database whose metadata row was removed", async () => {
    await migrateBackendDatabase(mockCurrentDb);
    await mockCurrentDb.execute(sql`delete from app_schema_meta where key = 'database'`);
    await expectOutdated();
  });

  it.each([
    ["publication receipt id", "alter table gift_publish_sessions drop column completed_album_id"],
    ["publication receipt version", "alter table gift_publish_sessions drop column completed_album_version"],
    ["account deletion state", "alter table users rename column deletion_state to obsolete_deletion_state"],
    ["account deletion challenges", "drop table account_deletion_challenges"],
    ["account deletion lease", "alter table account_deletion_jobs drop column lease_until"],
    ["account deletion media", "drop table account_deletion_media_objects"],
    ["relationship tombstones", "drop table gift_relationship_tombstones"],
    ["content reports", "drop table gift_content_reports"],
    ["user blocks", "drop table user_blocks"],
    ["management requests", "drop table gift_management_requests"],
    ["card display number", "alter table gift_cards rename column display_number to obsolete_display_number"],
    ["cover metadata", "alter table shared_albums drop column cover_byte_size"],
    ["cleanup lease", "alter table gift_media_cleanup_jobs drop column lease_until"],
    ["maintenance state", "drop table app_maintenance_state"],
  ])("rejects version 16 metadata when %s is missing", async (_name, statement) => {
    await migrateBackendDatabase(mockCurrentDb);
    await mockCurrentDb.execute(sql.raw(statement));
    await expectOutdated();
  });
});
