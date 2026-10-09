import type { SQLiteDatabase } from "expo-sqlite";
import { citySpotCheckinSchema } from "./city-spot-checkin-repository";

import { createLegacyLayout, normalizeLayout } from "../features/canvas/canvas-layout";
import {
  normalizeLegacyLocalLibraryOwner,
  type LocalLibraryOwner,
} from "../features/auth/local-library-owner";
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
type StoredMemoryOwnerRow = { id: string; ownerAccountKey: unknown };

/** 草稿箱同时保留的草稿数量；超出的旧草稿移入回收站，不直接删除。 */
export const draftBoxCapacity = 10;

/** 回收站保留天数；超过这个窗口且未恢复的条目会被永久删除。 */
export const recycleBinRetentionDays = 10;

function retentionCutoff(now: string, retentionDays = recycleBinRetentionDays) {
  return new Date(new Date(now).getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 回收站条目剩余可恢复天数；没有记录丢弃时间时返回 null。
 * 向上取整，使还能恢复的条目不会显示成 0 天。
 */
export function remainingRetentionDays(
  discardedAt: string | null | undefined,
  now: string,
): number | null {
  if (!discardedAt) return null;
  const discarded = new Date(discardedAt).getTime();
  const current = new Date(now).getTime();
  if (Number.isNaN(discarded) || Number.isNaN(current)) return null;
  const dayInMs = 24 * 60 * 60 * 1000;
  const expiresAt = discarded + recycleBinRetentionDays * dayInMs;
  return Math.max(0, Math.ceil((expiresAt - current) / dayInMs));
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync(citySpotCheckinSchema);
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
  if (!columns.some((column) => column.name === "discardedAt")) {
    await db.execAsync("ALTER TABLE memories ADD COLUMN discardedAt TEXT");
  }
  // Rows discarded by an earlier version carry no discard time. Start their
  // retention window at this upgrade instead of their original discard date, so
  // updating the app never destroys a recycle-bin entry on first launch.
  await db.runAsync(
    "UPDATE memories SET discardedAt = ? WHERE status = 'discarded' AND discardedAt IS NULL",
    new Date().toISOString(),
  );
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS memory_edit_drafts (
      memory_id TEXT NOT NULL,
      owner_account_key TEXT NOT NULL,
      base_updated_at TEXT NOT NULL,
      pages_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (memory_id, owner_account_key),
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS local_library_account_choices (
      account_owner TEXT PRIMARY KEY NOT NULL,
      selection TEXT NOT NULL CHECK (selection IN ('guest', 'account')),
      updated_at TEXT NOT NULL
    );

    UPDATE memories SET ownerAccountKey = 'guest'
      WHERE ownerAccountKey IS NULL
        OR trim(ownerAccountKey) = ''
        OR (
          lower(trim(ownerAccountKey)) <> 'guest'
          AND NOT (
            lower(trim(ownerAccountKey)) LIKE 'account:%@%.%'
            AND instr(substr(lower(trim(ownerAccountKey)), 9), ':') = 0
          )
          AND NOT (
            lower(trim(ownerAccountKey)) LIKE '%@%.%'
            AND lower(trim(ownerAccountKey)) NOT LIKE 'account:%'
            AND instr(lower(trim(ownerAccountKey)), ':') = 0
          )
        );
    UPDATE memories
      SET ownerAccountKey = 'account:' || lower(trim(substr(trim(ownerAccountKey), 9)))
      WHERE lower(trim(ownerAccountKey)) LIKE 'account:%@%.%';
    UPDATE memories
      SET ownerAccountKey = 'account:' || lower(trim(ownerAccountKey))
      WHERE lower(trim(ownerAccountKey)) <> 'guest'
        AND lower(trim(ownerAccountKey)) NOT LIKE 'account:%';

    DELETE FROM memory_edit_drafts
      WHERE NOT EXISTS (SELECT 1 FROM memories WHERE memories.id = memory_edit_drafts.memory_id);
    DELETE FROM memory_edit_drafts
      WHERE rowid NOT IN (SELECT MAX(rowid) FROM memory_edit_drafts GROUP BY memory_id);
    UPDATE memory_edit_drafts
      SET owner_account_key = (
        SELECT ownerAccountKey FROM memories WHERE memories.id = memory_edit_drafts.memory_id
      );

    CREATE INDEX IF NOT EXISTS memories_owner_updated_idx ON memories (ownerAccountKey, updatedAt);
  `);

  // SQLite has no portable regular-expression primitive. Reuse the exact
  // runtime validator so malformed legacy owners can never be normalized into
  // an account namespace that the app itself is unable to select.
  const storedOwners = await db.getAllAsync<StoredMemoryOwnerRow>(
    "SELECT id, ownerAccountKey FROM memories",
  );
  await db.withTransactionAsync(async () => {
    for (const row of storedOwners) {
      const normalizedOwner = normalizeLegacyLocalLibraryOwner(row.ownerAccountKey);
      if (row.ownerAccountKey === normalizedOwner) continue;
      await db.runAsync(
        "UPDATE memories SET ownerAccountKey = ? WHERE id = ?",
        normalizedOwner,
        row.id,
      );
    }
  });
  await db.execAsync(`
    UPDATE memory_edit_drafts
      SET owner_account_key = (
        SELECT ownerAccountKey FROM memories WHERE memories.id = memory_edit_drafts.memory_id
      );
  `);
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

export async function listMemories(db: SQLiteDatabase, accountKey: LocalLibraryOwner): Promise<Memory[]> {
  const rows = await db.getAllAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE (status IS NULL OR (status <> ? AND status <> ?)) AND ownerAccountKey = ? ORDER BY updatedAt DESC",
    "draft",
    "discarded",
    accountKey,
  );
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

export async function listDrafts(db: SQLiteDatabase, accountKey: LocalLibraryOwner): Promise<Memory[]> {
  const rows = await db.getAllAsync<MemoryRow>(
    `SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE status = 'draft' AND ownerAccountKey = ? ORDER BY updatedAt DESC, createdAt DESC, id DESC LIMIT ${draftBoxCapacity}`,
    accountKey,
  );
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

/**
 * Only new album drafts count towards the draft box. Overflow moves into the
 * recycle bin rather than being deleted, so the retention window is the only
 * thing that can destroy a draft the person never discarded themselves.
 */
export async function trimOldDrafts(
  db: SQLiteDatabase,
  accountKey: LocalLibraryOwner,
  discardedAt: string,
): Promise<string[]> {
  const old = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM memories WHERE status = 'draft' AND ownerAccountKey = ? ORDER BY updatedAt DESC, createdAt DESC, id DESC LIMIT -1 OFFSET ${draftBoxCapacity}`,
    accountKey,
  );
  const moved: string[] = [];
  for (const { id } of old) {
    const result = await db.runAsync(
      "UPDATE memories SET status = 'discarded', updatedAt = ?, discardedAt = ? WHERE id = ? AND ownerAccountKey = ? AND status = 'draft'",
      discardedAt,
      discardedAt,
      id,
      accountKey,
    );
    if (result.changes > 0) moved.push(id);
  }
  return moved;
}

/**
 * 回收站保留期清理：删除超过保留窗口且仍未恢复的条目。
 * 删除语句重复选取条件，避免清理刚刚被恢复的记忆。
 */
export async function purgeExpiredDiscardedMemories(
  db: SQLiteDatabase,
  accountKey: LocalLibraryOwner,
  now: string,
): Promise<string[]> {
  const cutoff = retentionCutoff(now);
  const expired = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM memories WHERE status = 'discarded' AND ownerAccountKey = ? AND discardedAt IS NOT NULL AND discardedAt <= ?",
    accountKey,
    cutoff,
  );
  const removed: string[] = [];
  for (const { id } of expired) {
    const result = await db.runAsync(
      "DELETE FROM memories WHERE id = ? AND ownerAccountKey = ? AND status = 'discarded' AND discardedAt IS NOT NULL AND discardedAt <= ?",
      id,
      accountKey,
      cutoff,
    );
    if (result.changes > 0) removed.push(id);
  }
  return removed;
}

export async function getMemory(
  db: SQLiteDatabase,
  id: string,
  accountKey: LocalLibraryOwner,
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
  accountKey: LocalLibraryOwner,
): Promise<Memory | null> {
  const row = await db.getFirstAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    id,
    "draft",
    accountKey,
  );
  return row ? hydrateMemory(db, row) : null;
}

/** 回收站：列出已丢弃的本机记忆，最近丢弃在前。 */
export async function listDiscardedMemories(db: SQLiteDatabase, accountKey: LocalLibraryOwner): Promise<Memory[]> {
  const rows = await db.getAllAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt, discardedAt FROM memories WHERE status = ? AND ownerAccountKey = ? ORDER BY discardedAt DESC, updatedAt DESC",
    "discarded",
    accountKey,
  );
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

/** 回收站条目数；只取计数，避免为了入口上的数字水合全部照片和页面。 */
export async function countDiscardedMemories(db: SQLiteDatabase, accountKey: LocalLibraryOwner): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM memories WHERE status = 'discarded' AND ownerAccountKey = ?",
    accountKey,
  );
  return Number(row?.total ?? 0);
}

/** 回收站：把已丢弃的记忆恢复为已保存。 */
export async function restoreDiscardedMemory(
  db: SQLiteDatabase,
  id: string,
  updatedAt: string,
  accountKey: LocalLibraryOwner,
) {
  // Clearing discardedAt both stops the retention clock and makes a concurrent
  // purge a no-op, because the purge re-checks `discardedAt IS NOT NULL`.
  await db.runAsync(
    "UPDATE memories SET status = ?, updatedAt = ?, discardedAt = NULL WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    "saved",
    updatedAt,
    id,
    "discarded",
    accountKey,
  );
}

/** Internal maintenance view used to avoid deleting photos referenced by drafts or recycle-bin rows. */
export async function listAllMemories(db: SQLiteDatabase, accountKey: LocalLibraryOwner): Promise<Memory[]> {
  const rows = await db.getAllAsync<MemoryRow>(
    "SELECT id, title, city, travelDate, status, coverColor, coverImage, ownerAccountKey, createdAt, updatedAt FROM memories WHERE ownerAccountKey = ? ORDER BY updatedAt DESC",
    accountKey,
  );
  return Promise.all(rows.map((row) => hydrateMemory(db, row)));
}

export async function saveMemory(db: SQLiteDatabase, memory: Memory, accountKey: LocalLibraryOwner) {
  await insertMemory(db, memory, "saved", accountKey);
}

export async function createDraft(db: SQLiteDatabase, memory: Memory, accountKey: LocalLibraryOwner) {
  await insertMemory(db, memory, "draft", accountKey);
}

async function insertMemory(
  db: SQLiteDatabase,
  memory: Memory,
  status: MemoryStatus,
  accountKey: LocalLibraryOwner,
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
  accountKey: LocalLibraryOwner,
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
  accountKey: LocalLibraryOwner,
) {
  await db.runAsync(
    "UPDATE memories SET status = ?, updatedAt = ?, discardedAt = ? WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    "discarded",
    updatedAt,
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
  accountKey: LocalLibraryOwner,
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

/** Replaces every persisted media reference for one owned album as one snapshot. */
export async function replaceMemoryMediaSnapshot(
  db: SQLiteDatabase,
  memory: Memory,
  accountKey: LocalLibraryOwner,
): Promise<boolean> {
  let replaced = false;
  await db.withTransactionAsync(async () => {
    const owned = await db.runAsync(
      "UPDATE memories SET title = ?, travelDate = ?, updatedAt = ?, coverImage = ? WHERE id = ? AND ownerAccountKey = ?",
      memory.title,
      memory.travelDate,
      memory.updatedAt,
      memory.coverImage ?? null,
      memory.id,
      accountKey,
    );
    if (owned.changes === 0) return;

    await db.runAsync("DELETE FROM memory_photos WHERE memory_id = ?", memory.id);
    for (const [position, uri] of memory.photoUris.entries()) {
      await db.runAsync(
        "INSERT INTO memory_photos (memory_id, uri, position) VALUES (?, ?, ?)",
        memory.id,
        uri,
        position,
      );
    }

    await db.runAsync("DELETE FROM story_pages WHERE memory_id = ?", memory.id);
    await writeStoryPages(db, memory.id, memory.pages);
    replaced = true;
  });
  return replaced;
}

/** 整体替换某个记忆的 memory_photos 行（照片 URI 持久化迁移用）。 */
export async function updateMemoryPhotos(
  db: SQLiteDatabase,
  memoryId: string,
  uris: readonly string[],
  accountKey: LocalLibraryOwner,
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
  accountKey: LocalLibraryOwner,
) {
  await db.runAsync(
    "UPDATE memories SET status = ?, updatedAt = ?, discardedAt = ? WHERE id = ? AND status = ? AND ownerAccountKey = ?",
    "discarded",
    updatedAt,
    updatedAt,
    id,
    "saved",
    accountKey,
  );
}

export async function deleteMemory(db: SQLiteDatabase, id: string, accountKey: LocalLibraryOwner) {
  await db.runAsync("DELETE FROM memories WHERE id = ? AND ownerAccountKey = ?", id, accountKey);
}

export async function clearMemories(db: SQLiteDatabase, accountKey: LocalLibraryOwner) {
  await db.runAsync("DELETE FROM memories WHERE ownerAccountKey = ?", accountKey);
}

