import type { SQLiteDatabase } from "expo-sqlite";

import {
  createDraft,
  discardDraft,
  discardMemory,
  getMemory,
  getDraft,
  listDiscardedMemories,
  listAllMemories,
  listMemories,
  migrateDbIfNeeded,
  restoreDiscardedMemory,
  saveMemory,
  saveDraft,
} from "../src/storage/memory-repository";

type MemoryRow = {
  id: string;
  title: string;
  city: "hangzhou" | "shanghai" | "shenzhen";
  travelDate: string;
  status?: "draft" | "saved" | "discarded";
  createdAt: string;
  updatedAt: string;
};

type FakeMemoryDatabase = {
  database: SQLiteDatabase;
  execStatements: string[];
  runCalls: Array<{ statement: string; parameters: unknown[] }>;
  rows: MemoryRow[];
};

const draftMemory = {
  id: "draft-1",
  title: "West Lake weekend",
  city: "hangzhou" as const,
  travelDate: "2026-07-20",
  photoUris: [],
  pages: [],
  createdAt: "2026-07-22T10:00:00.000Z",
  updatedAt: "2026-07-22T10:00:00.000Z",
};
const accountKey = "owner@example.com";

function createMemoryDatabase(options?: {
  columns?: string[];
  rows?: MemoryRow[];
}): FakeMemoryDatabase {
  const rows = [...(options?.rows ?? [])];
  const columns = options?.columns ?? [
    "id",
    "title",
    "city",
    "travelDate",
    "status",
    "createdAt",
    "updatedAt",
  ];
  const execStatements: string[] = [];
  const runCalls: Array<{ statement: string; parameters: unknown[] }> = [];

  const selectMemories = (statement: string, parameters: unknown[]) => {
    const id = statement.includes("WHERE id = ?")
      ? String(parameters[0])
      : undefined;
    const status = statement.includes("status = ?")
      ? String(parameters[id ? 1 : 0])
      : undefined;

    const excludesInactiveStatuses = statement.includes("status IS NULL OR (status <> ? AND status <> ?)");
    const allowsLegacyStatus = statement.includes("status IS NULL OR status = ?");

    return rows.filter(
      (row) =>
        (id === undefined || row.id === id) &&
        (status === undefined || row.status === status || (allowsLegacyStatus && row.status === undefined)) &&
        (!excludesInactiveStatuses || (row.status !== "draft" && row.status !== "discarded"))
    );
  };

  const getAllAsync = async <T>(statement: string, ...parameters: unknown[]) => {
    if (statement.startsWith("PRAGMA table_info(memories)")) {
      return columns.map((name) => ({ name })) as T[];
    }
    if (statement.includes("FROM memories")) {
      return selectMemories(statement, parameters) as T[];
    }
    return [] as T[];
  };

  const database = {
    async execAsync(statement: string) {
      execStatements.push(statement);
      if (statement.includes("ALTER TABLE memories ADD COLUMN status")) {
        for (const row of rows) {
          row.status ??= "saved";
        }
      }
    },
    async runAsync(statement: string, ...parameters: unknown[]) {
      runCalls.push({ statement, parameters });

      if (statement.startsWith("INSERT INTO memories")) {
        rows.push({
          id: String(parameters[0]),
          title: String(parameters[1]),
          city: parameters[2] as MemoryRow["city"],
          travelDate: String(parameters[3]),
          status: parameters[4] as MemoryRow["status"],
          createdAt: String(parameters[5]),
          updatedAt: String(parameters[6]),
        });
      }

      if (statement.startsWith("UPDATE memories SET status")) {
        const row = rows.find(
          (candidate) =>
            candidate.id === parameters[2] && candidate.status === parameters[3]
        );
        if (row) {
          row.status = parameters[0] as MemoryRow["status"];
          row.updatedAt = String(parameters[1]);
        }
      }

      return { changes: 1 };
    },
    getAllAsync,
    async getFirstAsync<T>(statement: string, ...parameters: unknown[]) {
      const result = await getAllAsync<T>(statement, ...parameters);
      return result[0] ?? null;
    },
    async withTransactionAsync(callback: () => Promise<void>) {
      await callback();
    },
  } as unknown as SQLiteDatabase;

  return { database, execStatements, runCalls, rows };
}

describe("memory draft lifecycle repository", () => {
  it("keeps a newly created draft out of the saved memory list", async () => {
    const { database } = createMemoryDatabase();

    await createDraft(database, draftMemory, accountKey);

    await expect(listMemories(database, accountKey)).resolves.toEqual([]);
    await expect(getDraft(database, draftMemory.id, accountKey)).resolves.toMatchObject({
      id: draftMemory.id,
      status: "draft",
    });
  });

  it("reads a legacy memory without a status as a valid saved memory", async () => {
    const { database } = createMemoryDatabase({
      rows: [{
        id: "legacy-1",
        title: "Legacy West Lake",
        city: "hangzhou",
        travelDate: "2026-07-20",
        createdAt: "2026-07-22T10:00:00.000Z",
        updatedAt: "2026-07-22T10:00:00.000Z",
      }],
    });

    await expect(getMemory(database, "legacy-1", accountKey)).resolves.toMatchObject({ id: "legacy-1" });
  });

  it("does not read draft or discarded memories as valid memory details", async () => {
    const { database } = createMemoryDatabase({
      rows: [
        { id: "draft-detail", title: "Draft", city: "hangzhou", travelDate: "2026-07-20", status: "draft", createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z" },
        { id: "discarded-detail", title: "Discarded", city: "hangzhou", travelDate: "2026-07-20", status: "discarded", createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z" },
      ],
    });

    await expect(getMemory(database, "draft-detail", accountKey)).resolves.toBeNull();
    await expect(getMemory(database, "discarded-detail", accountKey)).resolves.toBeNull();
  });

  it("confirms a draft as saved and marks an unconfirmed draft as discarded", async () => {
    const { database } = createMemoryDatabase();

    await createDraft(database, draftMemory, accountKey);
    await saveDraft(database, draftMemory.id, "2026-07-22T10:01:00.000Z", accountKey);

    await expect(listMemories(database, accountKey)).resolves.toMatchObject([
      { id: draftMemory.id, status: "saved" },
    ]);

    await createDraft(database, { ...draftMemory, id: "discard-me" }, accountKey);
    await discardDraft(database, "discard-me", "2026-07-22T10:02:00.000Z", accountKey);

    await expect(getDraft(database, "discard-me", accountKey)).resolves.toBeNull();
  });

  it("migrates legacy rows to saved without interpolating lifecycle values", async () => {
    const { database, execStatements, runCalls } = createMemoryDatabase({
      columns: ["id", "title", "city", "travelDate", "createdAt", "updatedAt"],
      rows: [
        {
          id: "legacy-memory",
          title: "Legacy Shanghai trip",
          city: "shanghai",
          travelDate: "2026-07-01",
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
    });

    await migrateDbIfNeeded(database);

    await expect(listMemories(database, accountKey)).resolves.toMatchObject([
      { id: "legacy-memory", status: "saved" },
    ]);
    expect(execStatements.join(" ")).toContain(
      "ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'saved'"
    );
    expect(runCalls).toEqual([]);
  });

  it("creates the local city collection arrangements table with cascading memory cleanup", async () => {
    const { database, execStatements } = createMemoryDatabase();

    await migrateDbIfNeeded(database);

    expect(execStatements.join(" ")).toContain("CREATE TABLE IF NOT EXISTS city_collection_arrangements");
    expect(execStatements.join(" ")).toContain("FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE");
    expect(execStatements.join(" ")).toContain("DROP INDEX IF EXISTS city_collection_arrangements_one_featured_city");
  });

  it("lists discarded memories in the recycle bin and restores one to saved", async () => {
    const { database } = createMemoryDatabase();

    await createDraft(database, draftMemory, accountKey);
    await discardDraft(database, draftMemory.id, "2026-07-22T10:02:00.000Z", accountKey);

    await expect(listDiscardedMemories(database, accountKey)).resolves.toMatchObject([
      { id: draftMemory.id, status: "discarded" },
    ]);
    await expect(listMemories(database, accountKey)).resolves.toEqual([]);

    await restoreDiscardedMemory(database, draftMemory.id, "2026-07-22T10:03:00.000Z", accountKey);

    await expect(listDiscardedMemories(database, accountKey)).resolves.toEqual([]);
    await expect(listMemories(database, accountKey)).resolves.toMatchObject([
      { id: draftMemory.id, status: "saved", updatedAt: "2026-07-22T10:03:00.000Z" },
    ]);
  });

  it("can inspect every current-account status for safe internal photo cleanup", async () => {
    const { database } = createMemoryDatabase();
    await createDraft(database, draftMemory, accountKey);
    await createDraft(database, { ...draftMemory, id: "discarded" }, accountKey);
    await discardDraft(database, "discarded", "2026-07-22T10:02:00.000Z", accountKey);

    await expect(listAllMemories(database, accountKey)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: draftMemory.id, status: "draft" }),
      expect.objectContaining({ id: "discarded", status: "discarded" }),
    ]));
  });

  it("moves a saved memory into the recycle bin instead of deleting it", async () => {
    const { database } = createMemoryDatabase();

    await saveMemory(database, { ...draftMemory, id: "saved-1" }, accountKey);
    await discardMemory(database, "saved-1", "2026-07-22T10:05:00.000Z", accountKey);

    await expect(listMemories(database, accountKey)).resolves.toEqual([]);
    await expect(listDiscardedMemories(database, accountKey)).resolves.toMatchObject([
      { id: "saved-1", status: "discarded", updatedAt: "2026-07-22T10:05:00.000Z" },
    ]);

    await restoreDiscardedMemory(database, "saved-1", "2026-07-22T10:06:00.000Z", accountKey);
    await expect(listMemories(database, accountKey)).resolves.toMatchObject([
      { id: "saved-1", status: "saved" },
    ]);
  });

  it("serializes a page canvas layout when saving a memory", async () => {
    const { database, runCalls } = createMemoryDatabase();
    await saveMemory(database, {
      ...draftMemory,
      id: "canvas-memory",
      pages: [{
        id: "canvas-page",
        position: 0,
        kind: "cover",
        headline: "Cover",
        body: "Body",
        layout: { aspectRatio: 1, elements: [] },
      }],
    }, accountKey);

    const pageInsert = runCalls.find((call) => call.statement.startsWith("INSERT INTO story_pages"));
    expect(pageInsert?.parameters).toContain('{"aspectRatio":1,"elements":[]}');
  });
});
