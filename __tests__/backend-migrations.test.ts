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
          and table_name in ('devices', 'memories', 'memory_pages')
        order by table_name
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "devices",
        "memories",
        "memory_pages",
      ]);
    } finally {
      await close();
    }
  });
});
