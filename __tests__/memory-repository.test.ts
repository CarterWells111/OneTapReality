import type { SQLiteDatabase } from "expo-sqlite";

import {
  createDraft,
  discardDraft,
  getDraft,
  listMemories,
  migrateDbIfNeeded,
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

    return rows.filter(
      (row) =>
        (id === undefined || row.id === id) &&
        (status === undefined || row.status === status)
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

    await createDraft(database, draftMemory);

    await expect(listMemories(database)).resolves.toEqual([]);
    await expect(getDraft(database, draftMemory.id)).resolves.toMatchObject({
      id: draftMemory.id,
      status: "draft",
    });
  });

  it("confirms a draft as saved and marks an unconfirmed draft as discarded", async () => {
    const { database } = createMemoryDatabase();

    await createDraft(database, draftMemory);
    await saveDraft(database, draftMemory.id, "2026-07-22T10:01:00.000Z");

    await expect(listMemories(database)).resolves.toMatchObject([
      { id: draftMemory.id, status: "saved" },
    ]);

    await createDraft(database, { ...draftMemory, id: "discard-me" });
    await discardDraft(database, "discard-me", "2026-07-22T10:02:00.000Z");

    await expect(getDraft(database, "discard-me")).resolves.toBeNull();
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

    await expect(listMemories(database)).resolves.toMatchObject([
      { id: "legacy-memory", status: "saved" },
    ]);
    expect(execStatements.join(" ")).toContain(
      "ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'saved'"
    );
    expect(runCalls).toEqual([]);
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
    });

    const pageInsert = runCalls.find((call) => call.statement.startsWith("INSERT INTO story_pages"));
    expect(pageInsert?.parameters).toContain('{"aspectRatio":1,"elements":[]}');
  });
});
