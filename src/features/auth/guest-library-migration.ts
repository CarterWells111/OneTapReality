import * as FileSystem from "expo-file-system/legacy";
import type { SQLiteDatabase } from "expo-sqlite";

import { localAccountDirectorySegment } from "./local-account";
import {
  GUEST_LIBRARY_OWNER,
  isLocalLibraryOwner,
  type AccountLocalLibraryOwner,
} from "./local-library-owner";
import { beginGuestLibraryMigration } from "./local-library-write-lease";

export type LocalLibrarySelection = "guest" | "account";

type ChoiceRow = { selection: LocalLibrarySelection };

type GuestLibrarySnapshot = {
  memories: (Record<string, unknown> & { id: string })[];
  photos: Record<string, unknown>[];
  pages: Record<string, unknown>[];
  drafts: Record<string, unknown>[];
  arrangements: Record<string, unknown>[];
};

export type PreparedGuestLibraryFiles = {
  replacements: ReadonlyMap<string, string>;
  commitCleanup: () => Promise<void>;
  rollback: () => Promise<void>;
};

type MigrationDependencies = {
  prepareFiles?: (
    accountOwner: AccountLocalLibraryOwner,
    memoryIds: readonly string[],
  ) => Promise<PreparedGuestLibraryFiles>;
  now?: () => string;
};

function assertAccountOwner(owner: AccountLocalLibraryOwner) {
  if (!isLocalLibraryOwner(owner) || String(owner) === GUEST_LIBRARY_OWNER) {
    throw new Error("Guest library migration requires an account owner");
  }
}

async function guestLibrarySnapshot(db: SQLiteDatabase): Promise<GuestLibrarySnapshot> {
  const memories = await db.getAllAsync<Record<string, unknown> & { id: string }>(
    `SELECT id, title, city, travelDate, status, coverColor, coverImage,
      createdAt, updatedAt, ownerAccountKey
      FROM memories WHERE ownerAccountKey = ? ORDER BY id ASC`,
    GUEST_LIBRARY_OWNER,
  );
  const photos = await db.getAllAsync<Record<string, unknown>>(
    `SELECT photos.memory_id, photos.id, photos.uri, photos.position
      FROM memory_photos AS photos
      INNER JOIN memories AS memory ON memory.id = photos.memory_id
      WHERE memory.ownerAccountKey = ?
      ORDER BY photos.memory_id ASC, photos.position ASC, photos.id ASC`,
    GUEST_LIBRARY_OWNER,
  );
  const pages = await db.getAllAsync<Record<string, unknown>>(
    `SELECT pages.memory_id, pages.id, pages.position, pages.kind, pages.headline,
      pages.body, pages.photo_uri, pages.layout_json
      FROM story_pages AS pages
      INNER JOIN memories AS memory ON memory.id = pages.memory_id
      WHERE memory.ownerAccountKey = ?
      ORDER BY pages.memory_id ASC, pages.position ASC, pages.id ASC`,
    GUEST_LIBRARY_OWNER,
  );
  const drafts = await db.getAllAsync<Record<string, unknown>>(
    `SELECT drafts.memory_id, drafts.owner_account_key, drafts.base_updated_at,
      drafts.pages_json, drafts.updated_at
      FROM memory_edit_drafts AS drafts
      INNER JOIN memories AS memory ON memory.id = drafts.memory_id
      WHERE memory.ownerAccountKey = ? AND drafts.owner_account_key = ?
      ORDER BY drafts.memory_id ASC`,
    GUEST_LIBRARY_OWNER,
    GUEST_LIBRARY_OWNER,
  );
  const arrangements = await db.getAllAsync<Record<string, unknown>>(
    `SELECT arrangements.memory_id, arrangements.city, arrangements.position,
      arrangements.is_featured, arrangements.updated_at
      FROM city_collection_arrangements AS arrangements
      INNER JOIN memories AS memory ON memory.id = arrangements.memory_id
      WHERE memory.ownerAccountKey = ?
      ORDER BY arrangements.memory_id ASC`,
    GUEST_LIBRARY_OWNER,
  );
  return { arrangements, drafts, memories, pages, photos };
}

export async function hasGuestLibrary(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM memories WHERE ownerAccountKey = ? LIMIT 1",
    GUEST_LIBRARY_OWNER,
  );
  return Boolean(row);
}

export async function getLocalLibrarySelection(
  db: SQLiteDatabase,
  owner: AccountLocalLibraryOwner,
): Promise<LocalLibrarySelection | null> {
  assertAccountOwner(owner);
  const row = await db.getFirstAsync<ChoiceRow>(
    "SELECT selection FROM local_library_account_choices WHERE account_owner = ?",
    owner,
  );
  return row?.selection === "guest" || row?.selection === "account" ? row.selection : null;
}

async function saveSelection(
  db: Pick<SQLiteDatabase, "runAsync">,
  owner: AccountLocalLibraryOwner,
  selection: LocalLibrarySelection,
  updatedAt: string,
) {
  await db.runAsync(
    `INSERT INTO local_library_account_choices (account_owner, selection, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(account_owner) DO UPDATE SET
        selection = excluded.selection,
        updated_at = excluded.updated_at`,
    owner,
    selection,
    updatedAt,
  );
}

export async function chooseGuestLibrary(
  db: SQLiteDatabase,
  owner: AccountLocalLibraryOwner,
  updatedAt = new Date().toISOString(),
): Promise<void> {
  assertAccountOwner(owner);
  await saveSelection(db, owner, "guest", updatedAt);
}

export async function chooseAccountLibrary(
  db: SQLiteDatabase,
  owner: AccountLocalLibraryOwner,
  updatedAt = new Date().toISOString(),
): Promise<void> {
  assertAccountOwner(owner);
  await saveSelection(db, owner, "account", updatedAt);
}

function photosRoot(owner: string) {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error("Local documents directory is unavailable");
  return `${root}photos/accounts/${localAccountDirectorySegment(owner)}/`;
}

function splitExtension(fileName: string): { stem: string; extension: string } {
  const dot = fileName.lastIndexOf(".");
  return dot > 0
    ? { stem: fileName.slice(0, dot), extension: fileName.slice(dot) }
    : { stem: fileName, extension: "" };
}

function assertSafeFileName(fileName: string) {
  if (!fileName || fileName === "." || fileName === ".." || fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0")) {
    throw new Error("Unsafe guest photo file name");
  }
}

async function unusedDestination(directory: string, fileName: string): Promise<string> {
  const direct = `${directory}${fileName}`;
  if (!(await FileSystem.getInfoAsync(direct)).exists) return direct;
  const { stem, extension } = splitExtension(fileName);
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const candidate = `${directory}${stem}.guest-${suffix}${extension}`;
    if (!(await FileSystem.getInfoAsync(candidate)).exists) return candidate;
  }
  throw new Error("Unable to allocate guest photo destination");
}

function canonicalReference(owner: string, memoryId: string, fileName: string): string {
  return `documents://photos/accounts/${localAccountDirectorySegment(owner)}/${encodeURIComponent(memoryId)}/${fileName}`;
}

async function prepareGuestLibraryFiles(
  owner: AccountLocalLibraryOwner,
  memoryIds: readonly string[],
): Promise<PreparedGuestLibraryFiles> {
  const guestRoot = photosRoot(GUEST_LIBRARY_OWNER);
  const accountRoot = photosRoot(owner);
  const replacements = new Map<string, string>();
  const copiedFiles: string[] = [];
  const sourceFiles: string[] = [];

  try {
    for (const memoryId of memoryIds) {
      const encodedMemoryId = encodeURIComponent(memoryId);
      const sourceDirectory = `${guestRoot}${encodedMemoryId}/`;
      const sourceInfo = await FileSystem.getInfoAsync(sourceDirectory);
      if (!sourceInfo.exists) continue;
      if (!sourceInfo.isDirectory) throw new Error("Guest album photo path is not a directory");

      const destinationDirectory = `${accountRoot}${encodedMemoryId}/`;
      await FileSystem.makeDirectoryAsync(destinationDirectory, { intermediates: true });
      const names = (await FileSystem.readDirectoryAsync(sourceDirectory)).sort();
      for (const fileName of names) {
        assertSafeFileName(fileName);
        const source = `${sourceDirectory}${fileName}`;
        const sourceFileInfo = await FileSystem.getInfoAsync(source);
        if (!sourceFileInfo.exists || sourceFileInfo.isDirectory) {
          throw new Error("Guest album contains an unsupported nested photo path");
        }
        const destination = await unusedDestination(destinationDirectory, fileName);
        await FileSystem.copyAsync({ from: source, to: destination });
        const destinationInfo = await FileSystem.getInfoAsync(destination);
        if (!destinationInfo.exists || destinationInfo.isDirectory) {
          throw new Error("Guest photo copy verification failed");
        }
        copiedFiles.push(destination);
        sourceFiles.push(source);
        const destinationName = destination.slice(destinationDirectory.length);
        replacements.set(source, destination);
        replacements.set(
          canonicalReference(GUEST_LIBRARY_OWNER, memoryId, fileName),
          canonicalReference(owner, memoryId, destinationName),
        );
      }
    }
  } catch (error) {
    await Promise.all(copiedFiles.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
    throw error;
  }

  return {
    replacements,
    rollback: async () => {
      await Promise.all(copiedFiles.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
    },
    commitCleanup: async () => {
      // Delete only the verified snapshot. A new guest album or photo created
      // concurrently after the transaction snapshot must never be removed.
      for (const source of sourceFiles) {
        await FileSystem.deleteAsync(source, { idempotent: true });
      }
    },
  };
}

function sameSnapshot(left: GuestLibrarySnapshot, right: GuestLibrarySnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function replaceReference(
  tx: SQLiteDatabase,
  before: string,
  after: string,
) {
  await tx.runAsync(
    "UPDATE memories SET coverImage = replace(coverImage, ?, ?) WHERE ownerAccountKey = ?",
    before,
    after,
    GUEST_LIBRARY_OWNER,
  );
  await tx.runAsync(
    "UPDATE memory_photos SET uri = replace(uri, ?, ?) WHERE memory_id IN (SELECT id FROM memories WHERE ownerAccountKey = ?)",
    before,
    after,
    GUEST_LIBRARY_OWNER,
  );
  await tx.runAsync(
    "UPDATE story_pages SET photo_uri = replace(photo_uri, ?, ?) WHERE memory_id IN (SELECT id FROM memories WHERE ownerAccountKey = ?)",
    before,
    after,
    GUEST_LIBRARY_OWNER,
  );
  await tx.runAsync(
    "UPDATE story_pages SET layout_json = replace(layout_json, ?, ?) WHERE memory_id IN (SELECT id FROM memories WHERE ownerAccountKey = ?)",
    before,
    after,
    GUEST_LIBRARY_OWNER,
  );
  await tx.runAsync(
    "UPDATE memory_edit_drafts SET pages_json = replace(pages_json, ?, ?) WHERE memory_id IN (SELECT id FROM memories WHERE ownerAccountKey = ?)",
    before,
    after,
    GUEST_LIBRARY_OWNER,
  );
}

export async function migrateGuestLibraryToAccount(
  db: SQLiteDatabase,
  owner: AccountLocalLibraryOwner,
  dependencies: MigrationDependencies = {},
): Promise<void> {
  assertAccountOwner(owner);
  const migrationLease = await beginGuestLibraryMigration(db);
  try {
    const before = await guestLibrarySnapshot(db);
    const memoryIds = before.memories.map((memory) => memory.id);
    const prepared = await (dependencies.prepareFiles ?? prepareGuestLibraryFiles)(owner, memoryIds);
    const updatedAt = (dependencies.now ?? (() => new Date().toISOString()))();

    try {
      await db.withExclusiveTransactionAsync(async (tx) => {
        const current = await guestLibrarySnapshot(tx);
        if (!sameSnapshot(before, current)) {
          throw new Error("Guest library changed during migration; please retry");
        }
        for (const [source, destination] of prepared.replacements) {
          await replaceReference(tx, source, destination);
        }
        await tx.runAsync(
          `UPDATE memory_edit_drafts SET owner_account_key = ?
            WHERE owner_account_key = ?
              AND memory_id IN (SELECT id FROM memories WHERE ownerAccountKey = ?)`,
          owner,
          GUEST_LIBRARY_OWNER,
          GUEST_LIBRARY_OWNER,
        );
        await tx.runAsync(
          "UPDATE memories SET ownerAccountKey = ? WHERE ownerAccountKey = ?",
          owner,
          GUEST_LIBRARY_OWNER,
        );
        await saveSelection(tx, owner, "account", updatedAt);
      });
    } catch (error) {
      await prepared.rollback();
      throw error;
    }

    // SQLite is already committed. A cleanup failure may leave only redundant
    // guest files and must never make the UI present the migration as rolled back.
    await prepared.commitCleanup().catch(() => undefined);
  } finally {
    migrationLease.release();
  }
}
