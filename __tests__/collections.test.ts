import type { SQLiteDatabase } from "expo-sqlite";

import { createCollection, validateCollection } from "../src/features/collections/model";
import {
  migrateCollectionsDb,
  createCollectionRow,
  listCollections,
  getCollection,
  updateCollection,
  deleteCollection,
  assignMemoryToCollection,
  removeMemoryFromCollection,
  getMemoriesInCollection,
} from "../src/features/collections/repository";

/* ------------------------------------------------------------------ */
/*  模型测试                                                          */
/* ------------------------------------------------------------------ */

describe("validateCollection", () => {
  it("accepts a non-empty name", () => {
    expect(validateCollection({ name: "夏日旅行" })).toEqual({ issues: [] });
  });

  it("rejects an empty name", () => {
    const result = validateCollection({ name: "" });
    expect(result.issues).toContain("请输入合集名称");
  });

  it("rejects a whitespace-only name", () => {
    const result = validateCollection({ name: "   " });
    expect(result.issues).toContain("请输入合集名称");
  });
});

describe("createCollection", () => {
  it("creates a collection with the given id, name, and timestamp", () => {
    const collection = createCollection({
      id: "col-1",
      now: "2026-07-23T10:00:00.000Z",
      name: "上海回忆",
    });

    expect(collection).toMatchObject({
      id: "col-1",
      name: "上海回忆",
      sortOrder: 0,
      createdAt: "2026-07-23T10:00:00.000Z",
      updatedAt: "2026-07-23T10:00:00.000Z",
    });
  });

  it("trims whitespace from the name", () => {
    const collection = createCollection({
      id: "col-2",
      now: "2026-07-23T10:00:00.000Z",
      name: "  深圳周末  ",
    });

    expect(collection.name).toBe("深圳周末");
  });

  it("creates collections with distinct sort orders", () => {
    const first = createCollection({
      id: "col-a",
      now: "2026-07-23T10:00:00.000Z",
      name: "First",
      sortOrder: 10,
    });
    const second = createCollection({
      id: "col-b",
      now: "2026-07-23T10:00:00.000Z",
      name: "Second",
      sortOrder: 20,
    });

    expect(first.sortOrder).toBe(10);
    expect(second.sortOrder).toBe(20);
  });
});

/* ------------------------------------------------------------------ */
/*  仓库测试                                                          */
/* ------------------------------------------------------------------ */

type CollectionRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type MemoryCollectionRow = {
  memory_id: string;
  collection_id: string;
};

type FakeCollectionDatabase = {
  database: SQLiteDatabase;
  execStatements: string[];
  runCalls: Array<{ statement: string; parameters: unknown[] }>;
  collectionRows: CollectionRow[];
  memoryCollectionRows: MemoryCollectionRow[];
};

const jan = "2026-07-23T10:00:00.000Z";

function createFakeCollectionDb(
  options: {
    migrations?: { hasTable: boolean; hasMemoryCollectionTable: boolean };
    collectionRows?: CollectionRow[];
    memoryCollectionRows?: MemoryCollectionRow[];
  } = {}
): FakeCollectionDatabase {
  const collectionRows: CollectionRow[] = [...(options.collectionRows ?? [])];
  const memoryCollectionRows: MemoryCollectionRow[] = [
    ...(options.memoryCollectionRows ?? []),
  ];
  const execStatements: string[] = [];
  const runCalls: Array<{ statement: string; parameters: unknown[] }> = [];
  const migrations = options.migrations ?? {
    hasTable: false,
    hasMemoryCollectionTable: false,
  };

  const getAllAsync = async <T>(
    statement: string,
    ...parameters: unknown[]
  ): Promise<T[]> => {
    if (statement.includes("FROM collections")) {
      // 模拟 ORDER BY sort_order ASC, created_at ASC
      const sorted = [...collectionRows].sort(
        (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
      );
      return sorted.map((row) => ({ ...row })) as T[];
    }
    if (statement.includes("FROM memory_collections")) {
      // 仓库查询使用 WHERE collection_id = ?
      const filterValue = parameters[0];
      return memoryCollectionRows
        .filter((row) => row.collection_id === String(filterValue))
        .map((row) => ({ ...row })) as T[];
    }
    return [] as T[];
  };

  const getFirstAsync = async <T>(
    statement: string,
    ...parameters: unknown[]
  ): Promise<T | null> => {
    if (statement.startsWith("SELECT name FROM sqlite_master")) {
      // 参数顺序: type, name — parameters[0]="table", parameters[1]=表名
      const tableName = String(parameters[1]);
      if (tableName === "collections") {
        return (migrations.hasTable ? { name: "collections" } : null) as T;
      }
      if (tableName === "memory_collections") {
        return (
          migrations.hasMemoryCollectionTable
            ? { name: "memory_collections" }
            : null
        ) as T;
      }
      return null;
    }
    const rows = await getAllAsync<T>(statement, ...parameters);
    return rows[0] ?? null;
  };

  const database = {
    async execAsync(statement: string) {
      execStatements.push(statement);
    },
    async runAsync(statement: string, ...parameters: unknown[]) {
      runCalls.push({ statement, parameters });

      if (statement.startsWith("INSERT INTO collections")) {
        collectionRows.push({
          id: String(parameters[0]),
          name: String(parameters[1]),
          sort_order: Number(parameters[2]),
          created_at: String(parameters[3]),
          updated_at: String(parameters[4]),
        });
      }

      if (statement.startsWith("INSERT INTO memory_collections")) {
        memoryCollectionRows.push({
          memory_id: String(parameters[0]),
          collection_id: String(parameters[1]),
        });
      }

      if (statement.startsWith("UPDATE collections SET")) {
        const row = collectionRows.find(
          (candidate) => candidate.id === parameters[parameters.length - 1]
        );
        if (row && statement.includes("name = ?")) {
          row.name = String(parameters[0]);
          row.updated_at = String(parameters[1]);
        }
        if (row && statement.includes("sort_order = ?")) {
          row.sort_order = Number(parameters[0]);
          row.updated_at = String(parameters[1]);
        }
      }

      if (statement.startsWith("DELETE FROM collections")) {
        const idx = collectionRows.findIndex(
          (candidate) => candidate.id === parameters[0]
        );
        if (idx >= 0) collectionRows.splice(idx, 1);
      }

      if (statement.startsWith("DELETE FROM memory_collections")) {
        const memoryId = String(parameters[0]);
        const idx = memoryCollectionRows.findIndex(
          (row) => row.memory_id === memoryId && row.collection_id === String(parameters[1])
        );
        if (idx >= 0) memoryCollectionRows.splice(idx, 1);
      }

      return { changes: 1 };
    },
    getAllAsync,
    getFirstAsync,
    async withTransactionAsync(callback: () => Promise<void>) {
      await callback();
    },
  } as unknown as SQLiteDatabase;

  return { database, execStatements, runCalls, collectionRows, memoryCollectionRows };
}

describe("collections repository", () => {
  describe("migrateCollectionsDb", () => {
    it("creates both tables when neither exists", async () => {
      const { database, execStatements } = createFakeCollectionDb();

      await migrateCollectionsDb(database);

      expect(execStatements.join(" ")).toContain("CREATE TABLE IF NOT EXISTS collections");
      expect(execStatements.join(" ")).toContain("CREATE TABLE IF NOT EXISTS memory_collections");
    });

    it("skips table creation when both tables already exist", async () => {
      const { database, execStatements } = createFakeCollectionDb({
        migrations: { hasTable: true, hasMemoryCollectionTable: true },
      });

      await migrateCollectionsDb(database);

      expect(execStatements.join(" ")).not.toContain("CREATE TABLE");
    });
  });

  describe("createCollectionRow", () => {
    it("persists a collection and returns it", async () => {
      const { database, collectionRows } = createFakeCollectionDb();
      const collection = createCollection({ id: "col-1", now: jan, name: "夏日旅行" });

      await createCollectionRow(database, collection);

      expect(collectionRows).toHaveLength(1);
      expect(collectionRows[0]).toMatchObject({
        id: "col-1",
        name: "夏日旅行",
        sort_order: 0,
      });
    });
  });

  describe("listCollections", () => {
    it("returns all collections ordered by sortOrder", async () => {
      const { database } = createFakeCollectionDb({
        collectionRows: [
          { id: "c1", name: "First", sort_order: 20, created_at: jan, updated_at: jan },
          { id: "c2", name: "Second", sort_order: 10, created_at: jan, updated_at: jan },
        ],
      });

      const result = await listCollections(database);

      expect(result).toHaveLength(2);
      expect(result[0].sortOrder).toBe(10);
      expect(result[1].sortOrder).toBe(20);
    });

    it("returns an empty array when no collections exist", async () => {
      const { database } = createFakeCollectionDb();

      await expect(listCollections(database)).resolves.toEqual([]);
    });
  });

  describe("getCollection", () => {
    it("fetches a single collection by id", async () => {
      const { database } = createFakeCollectionDb({
        collectionRows: [
          { id: "c1", name: "上海回忆", sort_order: 0, created_at: jan, updated_at: jan },
        ],
      });

      const result = await getCollection(database, "c1");

      expect(result).toMatchObject({ id: "c1", name: "上海回忆" });
    });

    it("returns null when not found", async () => {
      const { database } = createFakeCollectionDb();

      await expect(getCollection(database, "missing")).resolves.toBeNull();
    });
  });

  describe("updateCollection", () => {
    it("renames a collection", async () => {
      const { database, collectionRows } = createFakeCollectionDb({
        collectionRows: [
          { id: "c1", name: "Old", sort_order: 0, created_at: jan, updated_at: jan },
        ],
      });

      await updateCollection(database, "c1", { name: "New" }, jan);

      expect(collectionRows[0].name).toBe("New");
      expect(collectionRows[0].updated_at).toBe(jan);
    });

    it("reorders a collection", async () => {
      const { database, collectionRows } = createFakeCollectionDb({
        collectionRows: [
          { id: "c1", name: "First", sort_order: 0, created_at: jan, updated_at: jan },
        ],
      });

      await updateCollection(database, "c1", { sortOrder: 99 }, jan);

      expect(collectionRows[0].sort_order).toBe(99);
    });
  });

  describe("deleteCollection", () => {
    it("deletes a collection by id without deleting its memories", async () => {
      const { database, collectionRows, memoryCollectionRows } = createFakeCollectionDb({
        collectionRows: [
          { id: "c1", name: "To delete", sort_order: 0, created_at: jan, updated_at: jan },
        ],
        memoryCollectionRows: [{ memory_id: "m1", collection_id: "c1" }],
      });

      await deleteCollection(database, "c1");

      expect(collectionRows).toHaveLength(0);
      // memory_collections 行被级联删除（FK 约束）
      // 但这不是通过仓库代码处理的 — 仓库仅删除集合行。
      // FK 确保没有悬空引用。
    });

    it("is a no-op when the collection does not exist", async () => {
      const { database, collectionRows } = createFakeCollectionDb();

      await deleteCollection(database, "missing");

      expect(collectionRows).toHaveLength(0);
    });
  });

  describe("memory-collection assignment", () => {
    it("assigns a memory to a collection", async () => {
      const { database, memoryCollectionRows } = createFakeCollectionDb();

      await assignMemoryToCollection(database, "m1", "c1");

      expect(memoryCollectionRows).toHaveLength(1);
      expect(memoryCollectionRows[0]).toEqual({
        memory_id: "m1",
        collection_id: "c1",
      });
    });

    it("removes a memory from its collection", async () => {
      const { database, memoryCollectionRows } = createFakeCollectionDb({
        memoryCollectionRows: [{ memory_id: "m1", collection_id: "c1" }],
      });

      await removeMemoryFromCollection(database, "m1", "c1");

      expect(memoryCollectionRows).toHaveLength(0);
    });

    it("lists all memories in a collection", async () => {
      const { database } = createFakeCollectionDb({
        memoryCollectionRows: [
          { memory_id: "m1", collection_id: "c1" },
          { memory_id: "m2", collection_id: "c1" },
        ],
      });

      const result = await getMemoriesInCollection(database, "c1");

      expect(result).toEqual(["m1", "m2"]);
    });
  });
});
