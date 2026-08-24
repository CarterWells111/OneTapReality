import type { SQLiteDatabase } from "expo-sqlite";
import type { Memory } from "../src/types/memory";

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
  replaceMemoryMediaSnapshot,
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

type StoryPageRow = {
  id: string;
  memory_id: string;
  position: number;
  kind: "cover" | "photo" | "closing";
  headline: string;
  body: string;
  photo_uri: string | null;
  layout_json: string | null;
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
const accountKey = "account:owner@example.com";

const mediaSnapshotMemory: Memory = {
  ...draftMemory,
  id: "media-memory",
  updatedAt: "2026-08-17T12:00:00.000Z",
  coverImage: "documents://photos/accounts/owner%40example.com/media-memory/cover.jpg",
  photoUris: ["documents://photos/accounts/owner%40example.com/media-memory/photo.jpg"],
  pages: [{
    id: "media-page",
    position: 0,
    kind: "cover" as const,
    headline: "New headline",
    body: "New body",
    photoUri: "documents://photos/accounts/owner%40example.com/media-memory/page.jpg",
    layout: { aspectRatio: 1, elements: [{ id: "image", type: "image", uri: "documents://photos/accounts/owner%40example.com/media-memory/layout.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 }] },
  }],
};

function createMediaSnapshotDatabase(options?: { ownerAccountKey?: string; failStatement?: string }) {
  const state: {
    memory: { id: string; ownerAccountKey: string; title: string; travelDate: string; updatedAt: string; coverImage?: string };
    photos: string[];
    pages: Array<{ id: string; photoUri?: string; layoutJson: string }>;
  } = {
    memory: {
      id: mediaSnapshotMemory.id,
      ownerAccountKey: options?.ownerAccountKey ?? accountKey,
      title: "Old album name",
      travelDate: "2025-01-02",
      updatedAt: "old-updated-at",
      coverImage: "old-cover.jpg",
    },
    photos: ["old-photo.jpg"],
    pages: [{ id: "old-page", photoUri: "old-page.jpg", layoutJson: '{"old":true}' }],
  };
  const database = {
    async withTransactionAsync(callback: () => Promise<void>) {
      const before = structuredClone(state);
      try {
        await callback();
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
    async runAsync(statement: string, ...parameters: unknown[]) {
      if (options?.failStatement && statement.startsWith(options.failStatement)) {
        throw new Error("injected statement failure");
      }
      if (statement.startsWith("UPDATE memories SET title")) {
        if (state.memory.id !== parameters[4] || state.memory.ownerAccountKey !== parameters[5]) return { changes: 0 };
        state.memory.title = String(parameters[0]);
        state.memory.travelDate = String(parameters[1]);
        state.memory.updatedAt = String(parameters[2]);
        state.memory.coverImage = parameters[3] == null ? undefined : String(parameters[3]);
      } else if (statement.startsWith("UPDATE memories SET updatedAt")) {
        if (state.memory.id !== parameters[2] || state.memory.ownerAccountKey !== parameters[3]) return { changes: 0 };
        state.memory.updatedAt = String(parameters[0]);
        state.memory.coverImage = parameters[1] == null ? undefined : String(parameters[1]);
      } else if (statement.startsWith("DELETE FROM memory_photos")) {
        state.photos = [];
      } else if (statement.startsWith("INSERT INTO memory_photos")) {
        state.photos.push(String(parameters[1]));
      } else if (statement.startsWith("DELETE FROM story_pages")) {
        state.pages = [];
      } else if (statement.startsWith("INSERT INTO story_pages")) {
        state.pages.push({ id: String(parameters[0]), photoUri: parameters[6] == null ? undefined : String(parameters[6]), layoutJson: String(parameters[7]) });
      }
      return { changes: 1 };
    },
  } as unknown as SQLiteDatabase;

  return { database, state };
}

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
  const storyPages: StoryPageRow[] = [];

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
    if (statement.includes("FROM story_pages")) {
      return storyPages
        .filter((page) => page.memory_id === parameters[0])
        .sort((left, right) => left.position - right.position) as T[];
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

      if (statement.startsWith("INSERT INTO story_pages")) {
        storyPages.push({
          id: String(parameters[0]),
          memory_id: String(parameters[1]),
          position: Number(parameters[2]),
          kind: parameters[3] as StoryPageRow["kind"],
          headline: String(parameters[4]),
          body: String(parameters[5]),
          photo_uri: parameters[6] === null ? null : String(parameters[6]),
          layout_json: parameters[7] === null ? null : String(parameters[7]),
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

  it("round trips a formal full-bleed canvas element without shrinking it", async () => {
    const { database } = createMemoryDatabase();
    await saveMemory(database, {
      ...draftMemory,
      id: "full-bleed-memory",
      pages: [{
        id: "full-bleed-page",
        position: 0,
        kind: "photo",
        headline: "Full bleed",
        body: "",
        layout: {
          aspectRatio: 0.75,
          elements: [{ id: "hero", type: "image", uri: "file:///hero.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 }],
        },
      }],
    }, accountKey);

    const restored = await getMemory(database, "full-bleed-memory", accountKey);

    expect(restored?.pages[0].layout?.elements[0]).toMatchObject({ width: 1, height: 1 });
  });

  it("replaces an owned memory media snapshot atomically", async () => {
    const { database, state } = createMediaSnapshotDatabase();

    await expect(replaceMemoryMediaSnapshot(database, mediaSnapshotMemory, accountKey)).resolves.toBe(true);

    expect(state).toEqual({
      memory: expect.objectContaining({
        title: mediaSnapshotMemory.title,
        travelDate: mediaSnapshotMemory.travelDate,
        updatedAt: mediaSnapshotMemory.updatedAt,
        coverImage: mediaSnapshotMemory.coverImage,
      }),
      photos: mediaSnapshotMemory.photoUris,
      pages: [expect.objectContaining({
        id: "media-page",
        photoUri: "documents://photos/accounts/owner%40example.com/media-memory/page.jpg",
        layoutJson: JSON.stringify(mediaSnapshotMemory.pages[0].layout),
      })],
    });
  });

  it("rolls back every media field when a snapshot statement fails", async () => {
    const { database, state } = createMediaSnapshotDatabase({ failStatement: "INSERT INTO story_pages" });
    const before = structuredClone(state);

    await expect(replaceMemoryMediaSnapshot(database, mediaSnapshotMemory, accountKey)).rejects.toThrow("injected statement failure");

    expect(state).toEqual(before);
  });

  it("does not replace media owned by another account", async () => {
    const { database, state } = createMediaSnapshotDatabase({ ownerAccountKey: "other@example.com" });
    const before = structuredClone(state);

    await expect(replaceMemoryMediaSnapshot(database, mediaSnapshotMemory, accountKey)).resolves.toBe(false);

    expect(state).toEqual(before);
  });
});
