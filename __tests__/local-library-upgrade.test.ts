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
      runAsync: async () => undefined,
      withTransactionAsync: async (callback: () => Promise<void>) => callback(),
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

  it("maps malformed legacy account owners to guest through the runtime validator", async () => {
    const updates: Array<[string, string]> = [];
    const db = {
      execAsync: async () => undefined,
      getAllAsync: async (sql: string) => {
        if (sql.startsWith("PRAGMA table_info(memories)")) {
          return ["id", "status", "coverColor", "coverImage", "ownerAccountKey"].map((name) => ({ name }));
        }
        if (sql.startsWith("PRAGMA table_info(story_pages)")) return [{ name: "layout_json" }];
        if (sql.includes("SELECT id, ownerAccountKey FROM memories")) {
          return [
            { id: "bad-double-at", ownerAccountKey: "bad@@example.com" },
            { id: "bad-space", ownerAccountKey: "account:bad user@example.com" },
            { id: "valid", ownerAccountKey: " Owner@Example.COM " },
          ];
        }
        return [];
      },
      runAsync: async (_sql: string, owner: string, id: string) => { updates.push([id, owner]); },
      withTransactionAsync: async (callback: () => Promise<void>) => callback(),
    } as unknown as SQLiteDatabase;

    await migrateDbIfNeeded(db);

    expect(updates).toEqual(expect.arrayContaining([
      ["bad-double-at", "guest"],
      ["bad-space", "guest"],
      ["valid", "account:owner@example.com"],
    ]));
  });

  const sqliteIt = Number(process.versions.node.split(".")[0]) >= 22 ? it : it.skip;

  sqliteIt("normalizes a whitespace-padded prefixed owner in actual SQLite without adding a second colon", async () => {
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        city TEXT NOT NULL,
        travelDate TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'saved',
        coverColor TEXT,
        coverImage TEXT,
        ownerAccountKey TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE story_pages (
        id TEXT PRIMARY KEY NOT NULL,
        memory_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        kind TEXT NOT NULL,
        headline TEXT NOT NULL,
        body TEXT NOT NULL,
        photo_uri TEXT,
        layout_json TEXT
      );
      INSERT INTO memories (
        id, title, city, travelDate, status, ownerAccountKey, createdAt, updatedAt
      ) VALUES (
        'memory-1', 'Legacy', 'hangzhou', '2026-08-01', 'saved',
        ' account:Owner@Example.COM ', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
      );
      INSERT INTO memories (
        id, title, city, travelDate, status, ownerAccountKey, createdAt, updatedAt
      ) VALUES
        ('memory-bad-at', 'Bad', 'hangzhou', '2026-08-01', 'saved',
         'bad@@example.com', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
        ('memory-bad-space', 'Bad', 'hangzhou', '2026-08-01', 'saved',
         'account:bad user@example.com', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    `);
    const db = {
      execAsync: async (sql: string) => { sqlite.exec(sql); },
      getAllAsync: async <T>(sql: string, ...params: unknown[]) => (
        sqlite.prepare(sql).all(...params as never[]) as T[]
      ),
      runAsync: async (sql: string, ...params: unknown[]) => {
        sqlite.prepare(sql).run(...params as never[]);
      },
      withTransactionAsync: async (callback: () => Promise<void>) => callback(),
    } as unknown as SQLiteDatabase;

    try {
      await migrateDbIfNeeded(db);
      const row = sqlite.prepare("SELECT ownerAccountKey FROM memories WHERE id = ?").get("memory-1") as { ownerAccountKey: string };
      expect(row.ownerAccountKey).toBe("account:owner@example.com");
      expect(sqlite.prepare("SELECT ownerAccountKey FROM memories WHERE id = ?").get("memory-bad-at")).toEqual({ ownerAccountKey: "guest" });
      expect(sqlite.prepare("SELECT ownerAccountKey FROM memories WHERE id = ?").get("memory-bad-space")).toEqual({ ownerAccountKey: "guest" });
    } finally {
      sqlite.close();
    }
  });
});
