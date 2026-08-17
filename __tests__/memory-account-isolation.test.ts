import type { SQLiteDatabase } from "expo-sqlite";

import {
  claimUnownedMemories,
  clearMemories,
  deleteMemory,
  getMemory,
  listMemories,
  saveMemory,
} from "../src/storage/memory-repository";

const memory = {
  id: "memory-a",
  title: "Only mine",
  city: "hangzhou" as const,
  travelDate: "2026-08-16",
  photoUris: [],
  pages: [],
  createdAt: "2026-08-16T10:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
};

function databaseWithRows(rows: Array<Record<string, unknown>>) {
  const runCalls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async getAllAsync<T>(sql: string, ...params: unknown[]) {
      if (sql.includes("FROM memories")) {
        const accountKey = String(params.at(-1));
        return rows.filter((row) => row.ownerAccountKey === accountKey) as T[];
      }
      return [] as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: unknown[]) {
      const accountKey = String(params.at(-1));
      return (rows.find((row) => row.id === params[0] && row.ownerAccountKey === accountKey) ?? null) as T | null;
    },
    async runAsync(sql: string, ...params: unknown[]) {
      runCalls.push({ sql, params });
      if (sql.startsWith("UPDATE memories SET ownerAccountKey")) {
        let changes = 0;
        for (const row of rows) {
          if (row.ownerAccountKey == null) {
            row.ownerAccountKey = params[0];
            changes += 1;
          }
        }
        return { changes };
      }
      return { changes: 1 };
    },
    async execAsync() {},
    async withTransactionAsync(callback: () => Promise<void>) { await callback(); },
  } as unknown as SQLiteDatabase;
  return { db, runCalls };
}

describe("local memory account isolation", () => {
  it("lists and reads only rows owned by the current account", async () => {
    const { db } = databaseWithRows([
      { ...memory, ownerAccountKey: "owner@example.com", status: "saved" },
      { ...memory, id: "memory-b", ownerAccountKey: "other@example.com", status: "saved" },
    ]);

    await expect(listMemories(db, "owner@example.com")).resolves.toEqual([
      expect.objectContaining({ id: "memory-a" }),
    ]);
    await expect(getMemory(db, "memory-b", "owner@example.com")).resolves.toBeNull();
  });

  it("writes the owner key and scopes destructive operations in SQL", async () => {
    const { db, runCalls } = databaseWithRows([]);
    await saveMemory(db, memory, "owner@example.com");
    await deleteMemory(db, "memory-a", "owner@example.com");
    await clearMemories(db, "owner@example.com");

    const statements = runCalls.map((call) => `${call.sql} :: ${call.params.join("|")}`).join("\n");
    expect(statements).toContain("ownerAccountKey");
    expect(statements).toContain("WHERE id = ? AND ownerAccountKey = ?");
    expect(statements).toContain("WHERE ownerAccountKey = ?");
  });

  it("lets only the first authenticated account claim legacy rows", async () => {
    const rows = [{ ...memory, ownerAccountKey: null, status: "saved" }];
    const { db } = databaseWithRows(rows);

    await expect(claimUnownedMemories(db, "first@example.com")).resolves.toBe(1);
    await expect(claimUnownedMemories(db, "second@example.com")).resolves.toBe(0);
    expect(rows[0].ownerAccountKey).toBe("first@example.com");
  });
});
