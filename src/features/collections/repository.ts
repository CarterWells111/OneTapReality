import type { SQLiteDatabase } from "expo-sqlite";

import type { Collection } from "./model";

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

export async function migrateCollectionsDb(db: SQLiteDatabase) {
  const collectionTable = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = ? AND name = ?",
    "table",
    "collections"
  );
  if (!collectionTable) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  const memoryCollectionTable = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = ? AND name = ?",
    "table",
    "memory_collections"
  );
  if (!memoryCollectionTable) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS memory_collections (
        memory_id TEXT NOT NULL,
        collection_id TEXT NOT NULL,
        PRIMARY KEY (memory_id, collection_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      );
    `);
  }
}

function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCollectionRow(
  db: SQLiteDatabase,
  collection: Collection
): Promise<void> {
  await db.runAsync(
    "INSERT INTO collections (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    collection.id,
    collection.name,
    collection.sortOrder,
    collection.createdAt,
    collection.updatedAt
  );
}

export async function listCollections(
  db: SQLiteDatabase
): Promise<Collection[]> {
  const rows = await db.getAllAsync<CollectionRow>(
    "SELECT id, name, sort_order, created_at, updated_at FROM collections ORDER BY sort_order ASC, created_at ASC"
  );
  return rows.map(rowToCollection);
}

export async function getCollection(
  db: SQLiteDatabase,
  id: string
): Promise<Collection | null> {
  const row = await db.getFirstAsync<CollectionRow>(
    "SELECT id, name, sort_order, created_at, updated_at FROM collections WHERE id = ?",
    id
  );
  return row ? rowToCollection(row) : null;
}

export type CollectionUpdate = {
  name?: string;
  sortOrder?: number;
};

export async function updateCollection(
  db: SQLiteDatabase,
  id: string,
  update: CollectionUpdate,
  updatedAt: string
): Promise<void> {
  if (update.name !== undefined) {
    await db.runAsync(
      "UPDATE collections SET name = ?, updated_at = ? WHERE id = ?",
      update.name,
      updatedAt,
      id
    );
  }
  if (update.sortOrder !== undefined) {
    await db.runAsync(
      "UPDATE collections SET sort_order = ?, updated_at = ? WHERE id = ?",
      update.sortOrder,
      updatedAt,
      id
    );
  }
}

export async function deleteCollection(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync("DELETE FROM collections WHERE id = ?", id);
}

export async function assignMemoryToCollection(
  db: SQLiteDatabase,
  memoryId: string,
  collectionId: string
): Promise<void> {
  await db.runAsync(
    "INSERT INTO memory_collections (memory_id, collection_id) VALUES (?, ?)",
    memoryId,
    collectionId
  );
}

export async function removeMemoryFromCollection(
  db: SQLiteDatabase,
  memoryId: string,
  collectionId: string
): Promise<void> {
  await db.runAsync(
    "DELETE FROM memory_collections WHERE memory_id = ? AND collection_id = ?",
    memoryId,
    collectionId
  );
}

export async function getMemoriesInCollection(
  db: SQLiteDatabase,
  collectionId: string
): Promise<string[]> {
  const rows = await db.getAllAsync<MemoryCollectionRow>(
    "SELECT memory_id, collection_id FROM memory_collections WHERE collection_id = ?",
    collectionId
  );
  return rows.map((row) => row.memory_id);
}
