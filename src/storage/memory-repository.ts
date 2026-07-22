import type { SQLiteDatabase } from "expo-sqlite";

import type { Memory, StoryPage } from "../types/memory";

type MemoryRow = Omit<Memory, "photoUris" | "pages">;
type PhotoRow = { uri: string };
type StoryPageRow = Omit<StoryPage, "photoUri"> & { photo_uri: string | null };

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      travelDate TEXT NOT NULL,
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
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
  `);
}

function toStoryPage(row: StoryPageRow): StoryPage {
  return {
    id: row.id,
    position: row.position,
    kind: row.kind as StoryPage["kind"],
    headline: row.headline,
    body: row.body,
    ...(row.photo_uri ? { photoUri: row.photo_uri } : {}),
  };
}

async function hydrateMemory(db: SQLiteDatabase, row: MemoryRow): Promise<Memory> {
  const photos = await db.getAllAsync<PhotoRow>(
    "SELECT uri FROM memory_photos WHERE memory_id = ? ORDER BY position ASC",
    row.id
  );
  const pages = await db.getAllAsync<StoryPageRow>(
    "SELECT id, position, kind, headline, body, photo_uri FROM story_pages WHERE memory_id = ? ORDER BY position ASC",
    row.id
  );

  return {
    ...row,
    photoUris: photos.map((photo) => photo.uri),
    pages: pages.map(toStoryPage),
  };
}

export async function listMemories(db: SQLiteDatabase): Promise<Memory[]> {
  const rows = await db.getAllAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, createdAt, updatedAt FROM memories ORDER BY updatedAt DESC"
  );
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

export async function getMemory(
  db: SQLiteDatabase,
  id: string
): Promise<Memory | null> {
  const row = await db.getFirstAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, createdAt, updatedAt FROM memories WHERE id = ?",
    id
  );
  return row ? hydrateMemory(db, row) : null;
}

export async function saveMemory(db: SQLiteDatabase, memory: Memory) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO memories (id, title, city, travelDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      memory.id,
      memory.title,
      memory.city,
      memory.travelDate,
      memory.createdAt,
      memory.updatedAt
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

async function writeStoryPages(
  db: SQLiteDatabase,
  memoryId: string,
  pages: StoryPage[]
) {
  for (const page of pages) {
    await db.runAsync(
      "INSERT INTO story_pages (id, memory_id, position, kind, headline, body, photo_uri) VALUES (?, ?, ?, ?, ?, ?, ?)",
      page.id,
      memoryId,
      page.position,
      page.kind,
      page.headline,
      page.body,
      page.photoUri ?? null
    );
  }
}

export async function updateMemoryPages(
  db: SQLiteDatabase,
  memory: Memory
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE memories SET updatedAt = ? WHERE id = ?",
      memory.updatedAt,
      memory.id
    );
    await db.runAsync("DELETE FROM story_pages WHERE memory_id = ?", memory.id);
    await writeStoryPages(db, memory.id, memory.pages);
  });
}

export async function deleteMemory(db: SQLiteDatabase, id: string) {
  await db.runAsync("DELETE FROM memories WHERE id = ?", id);
}

export async function clearMemories(db: SQLiteDatabase) {
  await db.execAsync("DELETE FROM memories;");
}

