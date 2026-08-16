import { sql } from "drizzle-orm";

import {
  createBackendTestDatabase,
  migrateBackendDatabase,
} from "../src/server/db/test-database";

describe("backend PostgreSQL migrations", () => {
  it("applies the baseline to an empty database", async () => {
    const { db, close } = createBackendTestDatabase();

    try {
      await migrateBackendDatabase(db);
      const result = await db.execute(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('app_maintenance_state', 'app_schema_meta', 'auth_rate_limits', 'devices', 'memories', 'memory_pages', 'gifts', 'gift_members', 'shared_albums', 'gift_email_codes', 'gift_sessions', 'shared_album_pages', 'shared_album_media', 'gift_publish_sessions', 'gift_media_cleanup_jobs')
        order by table_name
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "app_maintenance_state",
        "app_schema_meta",
        "auth_rate_limits",
        "devices",
        "gift_media_cleanup_jobs",
        "gift_members",
        "gift_publish_sessions",
        "gifts",
        "memories",
        "memory_pages",
        "shared_album_media",
        "shared_album_pages",
        "shared_albums",
      ]);

      const schemaVersion = await db.execute(sql`
        select version from app_schema_meta where key = 'database'
      `);
      expect(schemaVersion.rows).toEqual([{ version: 8 }]);
    } finally {
      await close();
    }
  });
});
