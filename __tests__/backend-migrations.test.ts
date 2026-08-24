import { sql } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";

import {
  createBackendTestDatabase,
  migrateBackendDatabase,
} from "../src/server/db/test-database";

describe("backend PostgreSQL migrations", () => {
  it("preserves a legacy shared album with a null travel date when applying migration 0011", async () => {
    const { db, close } = createBackendTestDatabase();

    try {
      const migrationFiles = readdirSync("drizzle")
        .filter((file) => /^00(?:0\d|10)_.*\.sql$/.test(file))
        .sort();
      for (const migrationFile of migrationFiles) {
        const statements = readFileSync(`drizzle/${migrationFile}`, "utf8")
          .split("--> statement-breakpoint")
          .map((statement) => statement.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await db.execute(sql.raw(statement));
        }
      }

      await db.execute(sql`
        insert into gifts (id, token_hash, status, created_at)
        values ('legacy-travel-date-gift', 'legacy-travel-date-hash', 'bound', '2026-08-16T00:00:00.000Z')
      `);
      await db.execute(sql`
        insert into shared_albums (id, gift_id, source_memory_id, title, published_at, version)
        values ('legacy-travel-date-album', 'legacy-travel-date-gift', 'legacy-travel-date-memory', 'Legacy album', '2026-08-16T00:00:00.000Z', 1)
      `);

      const migration0011 = readFileSync("drizzle/0011_shared_album_travel_date.sql", "utf8");
      for (const statement of migration0011.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
        await db.execute(sql.raw(statement));
      }

      const legacyAlbum = await db.execute(sql`
        select id, travel_date from shared_albums where id = 'legacy-travel-date-album'
      `);
      expect(legacyAlbum.rows).toEqual([{ id: "legacy-travel-date-album", travel_date: null }]);
    } finally {
      await close();
    }
  });

  it("applies the baseline to an empty database", async () => {
    const { db, close } = createBackendTestDatabase();

    try {
      await migrateBackendDatabase(db);
      const result = await db.execute(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('account_deletion_challenges', 'account_deletion_jobs', 'account_deletion_media_objects', 'app_maintenance_state', 'app_schema_meta', 'auth_rate_limits', 'devices', 'memories', 'memory_pages', 'gifts', 'gift_members', 'gift_member_activations', 'shared_albums', 'gift_email_codes', 'gift_sessions', 'shared_album_pages', 'shared_album_media', 'gift_publish_sessions', 'gift_media_cleanup_jobs')
        order by table_name
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "account_deletion_challenges",
        "account_deletion_jobs",
        "account_deletion_media_objects",
        "app_maintenance_state",
        "app_schema_meta",
        "auth_rate_limits",
        "devices",
        "gift_email_codes",
        "gift_media_cleanup_jobs",
        "gift_member_activations",
        "gift_members",
        "gift_publish_sessions",
        "gift_sessions",
        "gifts",
        "memories",
        "memory_pages",
        "shared_album_media",
        "shared_album_pages",
        "shared_albums",
      ]);

      const coverColumns = await db.execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'shared_albums'
          and column_name in ('cover_object_key', 'cover_content_type', 'cover_byte_size')
        order by column_name
      `);
      expect(coverColumns.rows.map((row) => row.column_name)).toEqual([
        "cover_byte_size",
        "cover_content_type",
        "cover_object_key",
      ]);

      const travelDate = await db.execute(sql`
        select data_type
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'shared_albums'
          and column_name = 'travel_date'
      `);
      expect(travelDate.rows).toEqual([{ data_type: "text" }]);
      const travelDateMigration = readFileSync("drizzle/0011_shared_album_travel_date.sql", "utf8");
      const addTravelDateColumn = travelDateMigration.split("--> statement-breakpoint")[0];
      expect(addTravelDateColumn).toContain('ALTER TABLE "shared_albums" ADD COLUMN "travel_date" text;');
      expect(addTravelDateColumn).not.toMatch(/NOT NULL/i);

      await db.execute(sql`
        insert into gifts (id, token_hash, status, created_at)
        values ('travel-date-gift', 'travel-date-hash', 'bound', '2026-08-23T00:00:00.000Z')
      `);
      await expect(db.execute(sql`
        insert into shared_albums (id, gift_id, source_memory_id, title, published_at, version)
        values ('travel-date-album', 'travel-date-gift', 'travel-date-memory', 'Travel date album', '2026-08-23T00:00:00.000Z', 1)
      `)).resolves.toBeDefined();
      const storedTravelDate = await db.execute(sql`
        select travel_date from shared_albums where id = 'travel-date-album'
      `);
      expect(storedTravelDate.rows).toEqual([{ travel_date: null }]);

      const schemaMeta = await db.execute(sql`select version from app_schema_meta where key = 'database'`);
      expect(schemaMeta.rows).toEqual([{ version: 12 }]);

      const deletionMigration = readFileSync("drizzle/0012_external_beta_accounts_and_safety.sql", "utf8");
      expect(deletionMigration).toContain("account_deletion_challenges");
      expect(deletionMigration).toContain("account_deletion_jobs");
      expect(deletionMigration).toContain("account_deletion_media_objects");
      expect(deletionMigration).toContain("deletion_state");
      expect(deletionMigration).toContain("ON DELETE set null");

      const collaboration = await db.execute(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public' and table_name = 'gift_management_requests'
      `);
      expect(collaboration.rows).toEqual([{ table_name: "gift_management_requests" }]);

      const baseVersion = await db.execute(sql`
        select is_nullable, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'gift_publish_sessions' and column_name = 'base_version'
      `);
      expect(baseVersion.rows).toEqual([{ is_nullable: "NO", column_default: null }]);
      const requestColumns = await db.execute(sql`
        select column_name from information_schema.columns where table_schema = 'public'
        and table_name = 'gift_management_requests' order by column_name
      `);
      expect(requestColumns.rows.map(row => row.column_name)).toEqual(expect.arrayContaining(["action", "created_at", "decided_at", "gift_id", "requester_member_id", "status", "target_email", "target_role"]));
      const migration = readFileSync("drizzle/0010_shared_album_collaboration.sql", "utf8");
      expect(migration).toEqual(expect.stringContaining("gift_management_requests_action_check"));
      expect(migration).toEqual(expect.stringContaining("gift_management_requests_status_check"));
      expect(migration).toEqual(expect.stringContaining("gift_publish_sessions_member_id_gift_members_id_fk"));
      expect(migration).toEqual(expect.stringContaining("gift_publish_sessions_actor_user_id_users_id_fk"));
      expect(migration).toEqual(expect.stringContaining("ON DELETE set null"));
      expect(migration).toEqual(expect.stringContaining("gift_management_requests_gift_requester_member_fk"));
      expect(migration).toEqual(expect.stringContaining('FOREIGN KEY ("gift_id", "requester_member_id")'));
      expect(migration).toEqual(expect.stringContaining("gift_management_requests_gift_status_created_idx"));

      await db.execute(sql`insert into gifts (id, token_hash, status, created_at) values ('editor-gift', 'editor-hash', 'bound', '2026-08-16T00:00:00.000Z')`);
      await expect(db.execute(sql`
        insert into gift_members (id, gift_id, email, role, created_at)
        values ('editor-member', 'editor-gift', 'editor@example.com', 'editor', '2026-08-16T00:00:00.000Z')
      `)).resolves.toBeDefined();
      for (const values of [
        sql`('bad-delete', 'editor-gift', 'editor-member', 'delete_album', 'someone@example.com', null, 'pending', '2026-08-16T00:00:00.000Z', null)`,
        sql`('bad-remove', 'editor-gift', 'editor-member', 'remove_member', null, null, 'pending', '2026-08-16T00:00:00.000Z', null)`,
        sql`('bad-change', 'editor-gift', 'editor-member', 'change_member_role', 'someone@example.com', null, 'pending', '2026-08-16T00:00:00.000Z', null)`,
        sql`('bad-pending-time', 'editor-gift', 'editor-member', 'delete_album', null, null, 'pending', '2026-08-16T00:00:00.000Z', '2026-08-16T00:01:00.000Z')`,
        sql`('bad-decided-time', 'editor-gift', 'editor-member', 'delete_album', null, null, 'approved', '2026-08-16T00:00:00.000Z', null)`,
      ]) {
        await expect(db.execute(sql`insert into gift_management_requests (id, gift_id, requester_member_id, action, target_email, target_role, status, created_at, decided_at) values ${values}`)).rejects.toThrow();
      }
    } finally {
      await close();
    }
  });
});
