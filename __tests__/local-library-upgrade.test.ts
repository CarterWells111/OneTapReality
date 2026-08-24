import type { SQLiteDatabase } from "expo-sqlite";

import { migrateDbIfNeeded } from "../src/storage/memory-repository";

describe("1.1.1 local library upgrade", () => {
  it("idempotently maps legacy email owners to account namespaces and every unknown owner to guest", async () => {
    const statements: string[] = [];
    const db = {
      execAsync: async (sql: string) => { statements.push(sql); },
      getAllAsync: async (sql: string) => sql.startsWith("PRAGMA table_info(memories)")
        ? ["id", "status", "coverColor", "coverImage", "ownerAccountKey"].map((name) => ({ name }))
        : sql.startsWith("PRAGMA table_info(story_pages)") ? [{ name: "layout_json" }] : [],
    } as unknown as SQLiteDatabase;

    await migrateDbIfNeeded(db);
    await migrateDbIfNeeded(db);

    const sql = statements.join("\n");
    expect(sql).toContain("local_library_account_choices");
    expect(sql).toContain("ownerAccountKey = 'guest'");
    expect(sql).toContain("'account:' || lower(trim(ownerAccountKey))");
    expect(sql).toContain("UPDATE memory_edit_drafts");
    expect(sql).toContain("SELECT ownerAccountKey FROM memories");
    expect(sql).not.toContain("claimUnownedMemories");
  });
});
