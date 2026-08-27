import type { SQLiteDatabase } from "expo-sqlite";

import {
  clearMemoryEditDraft,
  getMemoryEditDraft,
  migrateMemoryEditDrafts,
  saveMemoryEditDraft,
} from "../src/storage/memory-edit-draft-repository";
import type { Memory, PhotoTemplateId, StoryPage } from "../src/types/memory";

const mockEmitDiagnostic = jest.fn();

jest.mock("../src/features/diagnostics/local-diagnostics", () => ({
  localDiagnostics: { emit: (...args: unknown[]) => mockEmitDiagnostic(...args) },
}));

type DraftRow = {
  memory_id: string;
  owner_account_key: string;
  base_updated_at: string;
  pages_json: string;
  updated_at: string;
};

type FormalMemoryRow = {
  id: string;
  ownerAccountKey: string;
  updatedAt: string;
  status?: "saved" | "draft" | "discarded";
};

type DraftDatabaseOptions = {
  execAsync?: (statement: string) => Promise<void>;
  onDraftRead?: (row: DraftRow, rows: Map<string, DraftRow>) => void;
  failDeletes?: boolean;
};

function rowKey(memoryId: string, ownerAccountKey: string) {
  return `${memoryId}\u0000${ownerAccountKey}`;
}

function createDraftDatabase(
  initialRows: DraftRow[] = [],
  formalMemories: FormalMemoryRow[] = [{
    id: "memory-1",
    ownerAccountKey: "account:owner@example.com",
    updatedAt: "2026-08-10T11:00:00.000Z",
    status: "saved",
  }],
  options: DraftDatabaseOptions = {},
) {
  const rows = new Map(initialRows.map((row) => [rowKey(row.memory_id, row.owner_account_key), row]));
  const execStatements: string[] = [];

  const database = {
    async execAsync(statement: string) {
      execStatements.push(statement);
      await options.execAsync?.(statement);
    },
    async runAsync(statement: string, ...parameters: unknown[]) {
      if (statement.startsWith("INSERT INTO memory_edit_drafts")) {
        const [pagesJson, updatedAt, memoryId, ownerAccountKey, baseUpdatedAt] = parameters as string[];
        const formalMemory = formalMemories.find((memory) => memory.id === memoryId
          && memory.ownerAccountKey === ownerAccountKey
          && memory.updatedAt === baseUpdatedAt
          && (memory.status === undefined || memory.status === "saved"));
        if (!formalMemory) return { changes: 0 };
        rows.set(rowKey(formalMemory.id, formalMemory.ownerAccountKey), {
          memory_id: formalMemory.id,
          owner_account_key: formalMemory.ownerAccountKey,
          base_updated_at: formalMemory.updatedAt,
          pages_json: pagesJson,
          updated_at: updatedAt,
        });
        return { changes: 1 };
      }
      if (statement.startsWith("DELETE FROM memory_edit_drafts")) {
        if (options.failDeletes) throw new Error("delete failed");
        const [memoryId, ownerAccountKey] = parameters as string[];
        const key = rowKey(memoryId, ownerAccountKey);
        const current = rows.get(key);
        const matchesObserved = parameters.length === 2 || (current
          && current.base_updated_at === parameters[2]
          && current.updated_at === parameters[3]
          && current.pages_json === parameters[4]);
        const deleted = matchesObserved ? rows.delete(key) : false;
        return { changes: deleted ? 1 : 0 };
      }
      throw new Error(`Unexpected runAsync statement: ${statement}`);
    },
    async getFirstAsync<T>(statement: string, ...parameters: unknown[]) {
      if (!statement.includes("FROM memory_edit_drafts")) {
        throw new Error(`Unexpected getFirstAsync statement: ${statement}`);
      }
      const [memoryId, ownerAccountKey] = parameters as string[];
      const row = rows.get(rowKey(memoryId, ownerAccountKey));
      if (!row) return null;
      const observed = { ...row };
      options.onDraftRead?.(observed, rows);
      return observed as T;
    },
  } as unknown as SQLiteDatabase;

  return { database, execStatements, rows };
}

const baseMemory: Memory = {
  id: "memory-1",
  title: "Lake weekend",
  city: "hangzhou",
  travelDate: "2026-08-10",
  photoUris: [],
  pages: [],
  createdAt: "2026-08-10T10:00:00.000Z",
  updatedAt: "2026-08-10T11:00:00.000Z",
};

const firstPage: StoryPage = {
  id: "page-late",
  position: 9,
  kind: "photo",
  headline: "Late",
  body: "Second in the saved order",
};

const secondPage: StoryPage = {
  id: "page-early",
  position: 3,
  kind: "cover",
  headline: "Early",
  body: "First in the saved order",
  layout: {
    aspectRatio: 99,
    elements: [{
      id: "headline",
      type: "text",
      text: "Safe text",
      fontStyle: "ChaoHuaTypewriter",
      color: "#24312B",
      fontSize: 20,
      x: 2,
      y: -2,
      width: 2,
      height: 0,
      rotation: 0,
      zIndex: 1,
    }],
  },
};

describe("memory edit draft repository", () => {
  beforeEach(() => {
    mockEmitDiagnostic.mockClear();
  });

  it("creates the account-scoped recovery table", async () => {
    const { database, execStatements } = createDraftDatabase();

    await migrateMemoryEditDrafts(database);

    const schema = execStatements.join(" ");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS memory_edit_drafts");
    expect(schema).toContain("memory_id TEXT NOT NULL");
    expect(schema).toContain("owner_account_key TEXT NOT NULL");
    expect(schema).toContain("base_updated_at TEXT NOT NULL");
    expect(schema).toContain("pages_json TEXT NOT NULL");
    expect(schema).toContain("updated_at TEXT NOT NULL");
    expect(schema).toContain("PRIMARY KEY (memory_id, owner_account_key)");
  });

  it("shares one in-flight schema initialization per database", async () => {
    let releaseMigration: (() => void) | undefined;
    const blockedMigration = new Promise<void>((resolve) => { releaseMigration = resolve; });
    const { database, execStatements } = createDraftDatabase([], undefined, {
      execAsync: async () => blockedMigration,
    });

    const first = migrateMemoryEditDrafts(database);
    const second = migrateMemoryEditDrafts(database);
    await Promise.resolve();
    expect(execStatements).toHaveLength(1);

    releaseMigration?.();
    await Promise.all([first, second]);
  });

  it("retries schema initialization after a failed attempt", async () => {
    let attempts = 0;
    const { database } = createDraftDatabase([], undefined, {
      execAsync: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("migration failed");
      },
    });

    await expect(migrateMemoryEditDrafts(database)).rejects.toThrow("migration failed");
    await expect(migrateMemoryEditDrafts(database)).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });

  it("round trips normalized safe story pages", async () => {
    const { database } = createDraftDatabase();

    await saveMemoryEditDraft(database, baseMemory, [firstPage, secondPage], "account:owner@example.com");

    await expect(getMemoryEditDraft(database, baseMemory, "account:owner@example.com")).resolves.toEqual([
      {
        ...secondPage,
        position: 0,
        layout: {
          aspectRatio: 3 / 4,
          elements: [{
            ...secondPage.layout!.elements[0],
            fontStyle: "ZhaohuaTypeWriter",
            x: 0.95,
            y: -0.95,
            width: 1,
            height: 0.03,
          }],
        },
      },
      { ...firstPage, position: 1 },
    ]);
  });

  it("round trips a recovery full-bleed canvas element without shrinking it", async () => {
    const { database } = createDraftDatabase();
    const fullBleedPage: StoryPage = {
      ...firstPage,
      layout: {
        aspectRatio: 0.75,
        elements: [{ id: "hero", type: "image", uri: "file:///hero.jpg", x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 }],
      },
    };

    await saveMemoryEditDraft(database, baseMemory, [fullBleedPage], "account:owner@example.com");

    const restored = await getMemoryEditDraft(database, baseMemory, "account:owner@example.com");
    expect(restored?.[0].layout?.elements[0]).toMatchObject({ width: 1, height: 1 });
  });

  it.each([48, 99])("round trips a legitimately scaled %i point canvas font", async (fontSize) => {
    const { database } = createDraftDatabase();
    const scaledPage: StoryPage = {
      ...secondPage,
      layout: {
        ...secondPage.layout!,
        elements: secondPage.layout!.elements.map((element) => (
          element.type === "text" ? { ...element, fontSize } : element
        )),
      },
    };

    await saveMemoryEditDraft(database, baseMemory, [scaledPage], "account:owner@example.com");

    await expect(getMemoryEditDraft(database, baseMemory, "account:owner@example.com"))
      .resolves.toEqual([expect.objectContaining({
        layout: expect.objectContaining({
          elements: [expect.objectContaining({ fontSize })],
        }),
      })]);
  });

  it("round trips valid page and layout cover colors", async () => {
    const { database } = createDraftDatabase();
    const coloredPage: StoryPage = {
      ...secondPage,
      coverColor: "#aBc123",
      layout: { ...secondPage.layout!, coverColor: "#D4E5F6" },
    };

    await saveMemoryEditDraft(database, baseMemory, [coloredPage], "account:owner@example.com");

    await expect(getMemoryEditDraft(database, baseMemory, "account:owner@example.com"))
      .resolves.toEqual([expect.objectContaining({
        coverColor: "#aBc123",
        layout: expect.objectContaining({ coverColor: "#D4E5F6" }),
      })]);
  });

  it("round trips known photo templates and omits forged template IDs", async () => {
    const { database } = createDraftDatabase();
    const validPage: StoryPage = {
      ...secondPage,
      layout: { ...secondPage.layout!, photoTemplateId: "classic-1" },
    };
    await saveMemoryEditDraft(database, baseMemory, [validPage], "owner@example.com");
    await expect(getMemoryEditDraft(database, baseMemory, "owner@example.com"))
      .resolves.toEqual([expect.objectContaining({ layout: expect.objectContaining({ photoTemplateId: "classic-1" }) })]);

    const invalidPage: StoryPage = {
      ...secondPage,
      layout: { ...secondPage.layout!, photoTemplateId: "forged-template" as PhotoTemplateId },
    };
    await saveMemoryEditDraft(database, baseMemory, [invalidPage], "owner@example.com");
    const restored = await getMemoryEditDraft(database, baseMemory, "owner@example.com");
    expect(restored?.[0].layout).not.toHaveProperty("photoTemplateId");
  });

  it("isolates recovery drafts across distinct albums owned by different accounts", async () => {
    const ownerAMemory = { ...baseMemory, id: "memory-a" };
    const ownerBMemory = { ...baseMemory, id: "memory-b" };
    const otherMemory = { ...baseMemory, id: "memory-2" };
    const { database } = createDraftDatabase([], [
      { id: ownerAMemory.id, ownerAccountKey: "account:owner-a@example.com", updatedAt: ownerAMemory.updatedAt, status: "saved" },
      { id: ownerBMemory.id, ownerAccountKey: "account:owner-b@example.com", updatedAt: ownerBMemory.updatedAt, status: "saved" },
      { id: otherMemory.id, ownerAccountKey: "account:owner-a@example.com", updatedAt: otherMemory.updatedAt, status: "saved" },
    ]);
    const ownerAPages = [{ ...firstPage, headline: "Owner A" }];
    const ownerBPages = [{ ...firstPage, headline: "Owner B" }];
    const otherAlbumPages = [{ ...firstPage, headline: "Other album" }];

    await saveMemoryEditDraft(database, ownerAMemory, ownerAPages, "account:owner-a@example.com");
    await saveMemoryEditDraft(database, ownerBMemory, ownerBPages, "account:owner-b@example.com");
    await saveMemoryEditDraft(database, otherMemory, otherAlbumPages, "account:owner-a@example.com");

    await expect(getMemoryEditDraft(database, ownerAMemory, "account:owner-a@example.com"))
      .resolves.toEqual([{ ...ownerAPages[0], position: 0 }]);
    await expect(getMemoryEditDraft(database, ownerBMemory, "account:owner-b@example.com"))
      .resolves.toEqual([{ ...ownerBPages[0], position: 0 }]);
    await expect(getMemoryEditDraft(database, otherMemory, "account:owner-a@example.com"))
      .resolves.toEqual([{ ...otherAlbumPages[0], position: 0 }]);
    await expect(getMemoryEditDraft(database, otherMemory, "account:owner-b@example.com"))
      .resolves.toBeNull();
  });

  it("rejects saving a draft for an album not owned by the account", async () => {
    const { database, rows } = createDraftDatabase();

    await expect(saveMemoryEditDraft(database, baseMemory, [firstPage], "account:attacker@example.com"))
      .rejects.toThrow(/stale or unowned/i);
    expect(rows.size).toBe(0);
  });

  it("rejects saving a draft from a stale formal album version", async () => {
    const { database, rows } = createDraftDatabase();
    const staleMemory = { ...baseMemory, updatedAt: "2026-08-10T10:30:00.000Z" };

    await expect(saveMemoryEditDraft(database, staleMemory, [firstPage], "account:owner@example.com"))
      .rejects.toThrow(/stale or unowned/i);
    expect(rows.size).toBe(0);
  });

  it("deletes a stale draft when the formal memory version changed", async () => {
    const { database } = createDraftDatabase();
    await saveMemoryEditDraft(database, baseMemory, [firstPage], "account:owner@example.com");

    const changedMemory = { ...baseMemory, updatedAt: "2026-08-10T12:00:00.000Z" };
    await expect(getMemoryEditDraft(database, changedMemory, "account:owner@example.com")).resolves.toBeNull();

    await expect(getMemoryEditDraft(database, baseMemory, "account:owner@example.com")).resolves.toBeNull();
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("recovery_discarded", {
      memoryId: "memory-1",
      reason: "stale",
    });
    expect(JSON.stringify(mockEmitDiagnostic.mock.calls)).not.toContain("account:owner@example.com");
  });

  it("does not delete a newer replacement while evicting an observed stale row", async () => {
    const staleRow: DraftRow = {
      memory_id: baseMemory.id,
      owner_account_key: "account:owner@example.com",
      base_updated_at: "2026-08-10T10:00:00.000Z",
      pages_json: JSON.stringify([firstPage]),
      updated_at: "2026-08-10T10:30:00.000Z",
    };
    const replacement: DraftRow = {
      ...staleRow,
      base_updated_at: baseMemory.updatedAt,
      pages_json: JSON.stringify([{ ...secondPage, position: 0 }]),
      updated_at: "2026-08-10T11:30:00.000Z",
    };
    const { database, rows } = createDraftDatabase([staleRow], undefined, {
      onDraftRead: (_row, storedRows) => storedRows.set(rowKey(baseMemory.id, "account:owner@example.com"), replacement),
    });

    await expect(getMemoryEditDraft(database, baseMemory, "account:owner@example.com")).resolves.toBeNull();
    expect(rows.get(rowKey(baseMemory.id, "account:owner@example.com"))).toEqual(replacement);
  });

  it("falls back to null when stale cleanup fails", async () => {
    const staleRow: DraftRow = {
      memory_id: baseMemory.id,
      owner_account_key: "account:owner@example.com",
      base_updated_at: "2026-08-10T10:00:00.000Z",
      pages_json: JSON.stringify([firstPage]),
      updated_at: "2026-08-10T10:30:00.000Z",
    };
    const { database } = createDraftDatabase([staleRow], undefined, { failDeletes: true });

    await expect(getMemoryEditDraft(database, baseMemory, "account:owner@example.com")).resolves.toBeNull();
  });

  it("rejects saving an empty page collection", async () => {
    const { database, rows } = createDraftDatabase();

    await expect(saveMemoryEditDraft(database, baseMemory, [], "account:owner@example.com"))
      .rejects.toThrow(/unsafe/i);
    expect(rows.size).toBe(0);
  });

  it.each([
    ["invalid JSON", "{"],
    ["non-array pages", JSON.stringify({ pages: [] })],
    ["empty pages", JSON.stringify([])],
    ["malformed page", JSON.stringify([{ id: "bad", position: 0, kind: "photo" }])],
    ["unsafe layout number", JSON.stringify([{
      id: "bad-layout",
      position: 0,
      kind: "photo",
      headline: "Bad",
      body: "Bad",
      layout: {
        aspectRatio: 0.75,
        elements: [{
          id: "bad-element",
          type: "text",
          text: "Bad",
          fontStyle: "System",
          color: "#000000",
          fontSize: 16,
          x: null,
          y: 0,
          width: 0.5,
          height: 0.5,
          rotation: 0,
          zIndex: 1,
        }],
      },
    }])],
    ["non-color text value", JSON.stringify([{
      id: "bad-color",
      position: 0,
      kind: "photo",
      headline: "Bad",
      body: "Bad",
      layout: {
        aspectRatio: 0.75,
        elements: [{
          id: "bad-text",
          type: "text",
          text: "Bad",
          fontStyle: "System",
          color: "not-a-color",
          fontSize: 16,
          x: 0,
          y: 0,
          width: 0.5,
          height: 0.5,
          rotation: 0,
          zIndex: 1,
        }],
      },
    }])],
    ["partial hex text color", JSON.stringify([{
      id: "partial-color",
      position: 0,
      kind: "photo",
      headline: "Bad",
      body: "Bad",
      layout: {
        aspectRatio: 0.75,
        elements: [{
          id: "bad-text",
          type: "text",
          text: "Bad",
          fontStyle: "System",
          color: "#123",
          fontSize: 16,
          x: 0,
          y: 0,
          width: 0.5,
          height: 0.5,
          rotation: 0,
          zIndex: 1,
        }],
      },
    }])],
  ])("deletes %s instead of returning unsafe pages", async (_label, pagesJson) => {
    const { database, rows } = createDraftDatabase([{
      memory_id: baseMemory.id,
      owner_account_key: "account:owner@example.com",
      base_updated_at: baseMemory.updatedAt,
      pages_json: pagesJson,
      updated_at: "2026-08-10T11:30:00.000Z",
    }]);

    await expect(getMemoryEditDraft(database, baseMemory, "account:owner@example.com")).resolves.toBeNull();
    expect(rows.has(rowKey(baseMemory.id, "account:owner@example.com"))).toBe(false);
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("recovery_discarded", {
      memoryId: "memory-1",
      reason: "corrupt",
    });
  });

  it.each([
    ["non-color page cover", "not-a-color", undefined],
    ["partial hex page cover", "#123", undefined],
    ["non-color layout cover", undefined, "not-a-color"],
    ["partial hex layout cover", undefined, "#123"],
  ])("deletes %s instead of restoring it", async (_label, pageCoverColor, layoutCoverColor) => {
    const corruptPage = {
      id: "bad-cover-color",
      position: 0,
      kind: "cover",
      headline: "Bad",
      body: "Bad",
      ...(pageCoverColor ? { coverColor: pageCoverColor } : {}),
      layout: {
        aspectRatio: 0.75,
        ...(layoutCoverColor ? { coverColor: layoutCoverColor } : {}),
        elements: [],
      },
    };
    const { database, rows } = createDraftDatabase([{
      memory_id: baseMemory.id,
      owner_account_key: "account:owner@example.com",
      base_updated_at: baseMemory.updatedAt,
      pages_json: JSON.stringify([corruptPage]),
      updated_at: "2026-08-10T11:30:00.000Z",
    }]);

    await expect(getMemoryEditDraft(database, baseMemory, "account:owner@example.com")).resolves.toBeNull();
    expect(rows.has(rowKey(baseMemory.id, "account:owner@example.com"))).toBe(false);
  });

  it("clears only the selected album and owner recovery draft", async () => {
    const ownerAMemory = { ...baseMemory, id: "memory-a" };
    const ownerBMemory = { ...baseMemory, id: "memory-b" };
    const otherMemory = { ...baseMemory, id: "memory-2" };
    const { database } = createDraftDatabase([], [
      { id: ownerAMemory.id, ownerAccountKey: "account:owner-a@example.com", updatedAt: ownerAMemory.updatedAt, status: "saved" },
      { id: ownerBMemory.id, ownerAccountKey: "account:owner-b@example.com", updatedAt: ownerBMemory.updatedAt, status: "saved" },
      { id: otherMemory.id, ownerAccountKey: "account:owner-a@example.com", updatedAt: otherMemory.updatedAt, status: "saved" },
    ]);
    await saveMemoryEditDraft(database, ownerAMemory, [firstPage], "account:owner-a@example.com");
    await saveMemoryEditDraft(database, ownerBMemory, [secondPage], "account:owner-b@example.com");
    await saveMemoryEditDraft(database, otherMemory, [secondPage], "account:owner-a@example.com");

    await clearMemoryEditDraft(database, ownerAMemory.id, "account:owner-a@example.com");

    await expect(getMemoryEditDraft(database, ownerAMemory, "account:owner-a@example.com")).resolves.toBeNull();
    await expect(getMemoryEditDraft(database, ownerBMemory, "account:owner-b@example.com")).resolves.not.toBeNull();
    await expect(getMemoryEditDraft(database, otherMemory, "account:owner-a@example.com")).resolves.not.toBeNull();
  });
});
