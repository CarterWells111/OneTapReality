import type { SQLiteDatabase } from "expo-sqlite";

import { createLegacyLayout, normalizeLayout } from "../features/canvas/canvas-layout";
import type { CanvasLayout, Memory, MemoryStatus, StoryPage } from "../types/memory";

type MemoryRow = Omit<Memory, "photoUris" | "pages"> & {
  status?: MemoryStatus;
  coverColor?: string | null;
  coverImage?: string | null;
  ownerAccountKey?: string | null;
};
type PhotoRow = { uri: string };
type StoryPageRow = Omit<StoryPage, "photoUri" | "layout"> & { photo_uri: string | null; layout_json: string | null };
type ColumnRow = { name: string };

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      travelDate TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'saved',
      coverColor TEXT,
      ownerAccountKey TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT NOT NULL,
      uri TEXT NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS story_pages (
      id TEXT PRIMARY KEY NOT NULL,
      memory_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      kind TEXT NOT NULL,
      headline TEXT NOT NULL,
      body TEXT NOT NULL,
      photo_uri TEXT,
      layout_json TEXT,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS city_collection_arrangements (
      memory_id TEXT PRIMARY KEY NOT NULL,
      city TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
      updated_at TEXT NOT NULL,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS city_collection_arrangements_city_position
      ON city_collection_arrangements (city, position);
    DROP INDEX IF EXISTS city_collection_arrangements_one_featured_city;
  `);

  const columns = await db.getAllAsync<ColumnRow>("PRAGMA table_info(memories)");
  if (!columns.some((column) => column.name === "status")) {
    await db.execAsync(
      "ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'saved'"
    );
  }
  if (!columns.some((column) => column.name === "coverColor")) {
    await db.execAsync("ALTER TABLE memories ADD COLUMN coverColor TEXT");
  }
  if (!columns.some((column) => column.name === "coverImage")) {
    await db.execAsync("ALTER TABLE memories ADD COLUMN coverImage TEXT");
  }
  if (!columns.some((column) => column.name === "ownerAccountKey")) {
    await db.execAsync("ALTER TABLE memories ADD COLUMN ownerAccountKey TEXT");
  }
  await db.execAsync("CREATE INDEX IF NOT EXISTS memories_owner_updated_idx ON memories (ownerAccountKey, updatedAt);");
  const pageColumns = await db.getAllAsync<ColumnRow>("PRAGMA table_info(story_pages)");
  if (!pageColumns.some((column) => column.name === "layout_json")) {
    await db.execAsync("ALTER TABLE story_pages ADD COLUMN layout_json TEXT");
  }
}

function toStoryPage(row: StoryPageRow): StoryPage {
  const page = {
    id: row.id,
    position: row.position,
    kind: row.kind as StoryPage["kind"],
    headline: row.headline,
    body: row.body,
    ...(row.photo_uri ? { photoUri: row.photo_uri } : {}),
  };
  let layout: CanvasLayout | undefined;
  if (row.layout_json) {
    try {
      layout = normalizeLayout(JSON.parse(row.layout_json) as CanvasLayout);
    } catch {
      layout = undefined;
    }
  }
  return { ...page, layout: layout ?? createLegacyLayout(page) };
}

async function hydrateMemory(db: SQLiteDatabase, row: MemoryRow): Promise<Memory> {
  const photos = await db.getAllAsync<PhotoRow>(
    "SELECT uri FROM memory_photos WHERE memory_id = ? ORDER BY position ASC",
    row.id
  );
  const pages = await db.getAllAsync<StoryPageRow>(
    "SELECT id, position, kind, headline, body, photo_uri, layout_json FROM story_pages WHERE memory_id = ? ORDER BY position ASC",
    row.id
  );

  const { ownerAccountKey: _ownerAccountKey, ...memoryRow } = row;
  return {
    ...memoryRow,
    photoUris: photos.map((photo) => photo.uri),
    pages: pages.map(toStoryPage),
  };
}

export async function listMemories(db: SQLiteDatabase, accountKey: string): Promise<Memory[]> {
  const rows = await db.getAllAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE (status IS NULL OR (status <> ? AND status <> ?)) AND ownerAccountKey = ? ORDER BY updatedAt DESC",
    "draft",
    "discarded",
    accountKey,
  );
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

export async function getMemory(
  db: SQLiteDatabase,
  id: string,
  accountKey: string,
): Promise<Memory | null> {
  const row = await db.getFirstAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE id = ? AND (status IS NULL OR status = ?) AND ownerAccountKey = ?",
    id,
    "saved",
    accountKey,
  );
  return row ? hydrateMemory(db, row) : null;
}

export async function getDraft(
  db: SQLiteDatabase,
  id: string,
  accountKey: string,
): Promise<Memory | null> {
  const row = await db.getFirstAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    id,
    "draft",
    accountKey,
  );
  return row ? hydrateMemory(db, row) : null;
}

/** 回收站：列出已丢弃的本机记忆，最近更新在前。 */
export async function listDiscardedMemories(db: SQLiteDatabase, accountKey: string): Promise<Memory[]> {
  const rows = await db.getAllAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE status = ? AND ownerAccountKey = ? ORDER BY updatedAt DESC",
    "discarded",
    accountKey,
  );
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

/** 回收站：把已丢弃的记忆恢复为已保存。 */
export async function restoreDiscardedMemory(
  db: SQLiteDatabase,
  id: string,
  updatedAt: string,
  accountKey: string,
) {
  await db.runAsync(
    "UPDATE memories SET status = ?, updatedAt = ? WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    "saved",
    updatedAt,
    id,
    "discarded",
    accountKey,
  );
}

/** Internal maintenance view used to avoid deleting photos referenced by drafts or recycle-bin rows. */
export async function listAllMemories(db: SQLiteDatabase, accountKey: string): Promise<Memory[]> {
  const rows = await db.getAllAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE ownerAccountKey = ? ORDER BY updatedAt DESC",
    accountKey,
  );
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

export async function saveMemory(db: SQLiteDatabase, memory: Memory, accountKey: string) {
  await insertMemory(db, memory, "saved", accountKey);
}

export async function createDraft(db: SQLiteDatabase, memory: Memory, accountKey: string) {
  await insertMemory(db, memory, "draft", accountKey);
}

async function insertMemory(
  db: SQLiteDatabase,
  memory: Memory,
  status: MemoryStatus,
  accountKey: string,
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO memories (id, title, city, travelDate, status, createdAt, updatedAt, coverColor, coverImage, ownerAccountKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      memory.id,
      memory.title,
      memory.city,
      memory.travelDate,
      status,
      memory.createdAt,
      memory.updatedAt,
      memory.coverColor ?? null,
      memory.coverImage ?? null,
      accountKey,
    );

    for (const [position, uri] of memory.photoUris.entries()) {
      await db.runAsync(
        "INSERT INTO memory_photos (memory_id, uri, position) VALUES (?, ?, ?)",
        memory.id,
        uri,
        position
      );
    }

    await writeStoryPages(db, memory.id, memory.pages);
  });
}

export async function saveDraft(
  db: SQLiteDatabase,
  id: string,
  updatedAt: string,
  accountKey: string,
) {
  await db.runAsync(
    "UPDATE memories SET status = ?, updatedAt = ? WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    "saved",
    updatedAt,
    id,
    "draft",
    accountKey,
  );
}

export async function discardDraft(
  db: SQLiteDatabase,
  id: string,
  updatedAt: string,
  accountKey: string,
) {
  await db.runAsync(
    "UPDATE memories SET status = ?, updatedAt = ? WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    "discarded",
    updatedAt,
    id,
    "draft",
    accountKey,
  );
}

async function writeStoryPages(
  db: SQLiteDatabase,
  memoryId: string,
  pages: StoryPage[]
) {
  for (const page of pages) {
    await db.runAsync(
      "INSERT INTO story_pages (id, memory_id, position, kind, headline, body, photo_uri, layout_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      page.id,
      memoryId,
      page.position,
      page.kind,
      page.headline,
      page.body,
      page.photoUri ?? null,
      JSON.stringify(page.layout ?? createLegacyLayout(page))
    );
  }
}

export async function updateMemoryPages(
  db: SQLiteDatabase,
  memory: Memory,
  accountKey: string,
) {
  await db.withTransactionAsync(async () => {
    const owned = await db.runAsync(
      "UPDATE memories SET updatedAt = ?, coverImage = ? WHERE id = ? AND ownerAccountKey = ?",
      memory.updatedAt,
      memory.coverImage ?? null,
      memory.id,
      accountKey,
    );
    if (owned.changes === 0) return;
    await db.runAsync("DELETE FROM story_pages WHERE memory_id = ?", memory.id);
    await writeStoryPages(db, memory.id, memory.pages);
  });
}

/** 整体替换某个记忆的 memory_photos 行（照片 URI 持久化迁移用）。 */
export async function updateMemoryPhotos(
  db: SQLiteDatabase,
  memoryId: string,
  uris: readonly string[],
  accountKey: string,
) {
  await db.withTransactionAsync(async () => {
    const owned = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM memories WHERE id = ? AND ownerAccountKey = ?",
      memoryId,
      accountKey,
    );
    if (!owned) return;
    await db.runAsync("DELETE FROM memory_photos WHERE memory_id = ?", memoryId);
    for (const [position, uri] of uris.entries()) {
      await db.runAsync(
        "INSERT INTO memory_photos (memory_id, uri, position) VALUES (?, ?, ?)",
        memoryId,
        uri,
        position
      );
    }
  });
}

/** 把已保存的旅行册移入回收站（软删除，可在回收站恢复或彻底删除）。 */
export async function discardMemory(
  db: SQLiteDatabase,
  id: string,
  updatedAt: string,
  accountKey: string,
) {
  await db.runAsync(
    "UPDATE memories SET status = ?, updatedAt = ? WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    "discarded",
    updatedAt,
    id,
    "saved",
    accountKey,
  );
}

export async function deleteMemory(db: SQLiteDatabase, id: string, accountKey: string) {
  await db.runAsync("DELETE FROM memories WHERE id = ? AND ownerAccountKey = ?", id, accountKey);
}

export async function clearMemories(db: SQLiteDatabase, accountKey: string) {
  await db.runAsync("DELETE FROM memories WHERE ownerAccountKey = ?", accountKey);
}

export async function claimUnownedMemories(db: SQLiteDatabase, accountKey: string): Promise<number> {
  let changes = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      "UPDATE memories SET ownerAccountKey = ? WHERE ownerAccountKey IS NULL",
      accountKey,
    );
    changes = result.changes;
  });
  return changes;
}

