import type { SQLiteDatabase } from "expo-sqlite";

import { normalizeLayout } from "../features/canvas/canvas-layout";
import type { LocalLibraryOwner } from "../features/auth/local-library-owner";
import { resolvePhotoTemplate } from "../features/canvas/photo-templates";
import { localDiagnostics } from "../features/diagnostics/local-diagnostics";
import { normalizeStoryPages } from "../features/pages/story-page-manager";
import type { CanvasElement, CanvasLayout, Memory, StoryPage } from "../types/memory";

type MemoryEditDraftRow = {
  base_updated_at: string;
  pages_json: string;
  updated_at: string;
};

const migrationPromises = new WeakMap<object, Promise<void>>();
const VALID_HEX_COLOR = /^#[0-9A-F]{6}$/i;
// Pinch transforms can exceed the toolbar slider range. This ceiling only rejects
// absurd persisted values before they reach a native text style.
const MAX_NATIVE_SAFE_FONT_SIZE = 4096;

export function migrateMemoryEditDrafts(db: SQLiteDatabase): Promise<void> {
  const existing = migrationPromises.get(db);
  if (existing) return existing;
  const migration = db.execAsync(`
    CREATE TABLE IF NOT EXISTS memory_edit_drafts (
      memory_id TEXT NOT NULL,
      owner_account_key TEXT NOT NULL,
      base_updated_at TEXT NOT NULL,
      pages_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (memory_id, owner_account_key),
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
  `).catch((error: unknown) => {
    migrationPromises.delete(db);
    throw error;
  });
  migrationPromises.set(db, migration);
  return migration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && VALID_HEX_COLOR.test(value);
}

function hasOptionalString(value: Record<string, unknown>, key: string) {
  return value[key] === undefined || typeof value[key] === "string";
}

function parseCanvasElement(value: unknown): CanvasElement | null {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isFiniteNumber(value.x)
    || !isFiniteNumber(value.y)
    || !isFiniteNumber(value.width)
    || !isFiniteNumber(value.height)
    || !isFiniteNumber(value.rotation)
    || !isFiniteNumber(value.zIndex)) {
    return null;
  }

  const base = {
    id: value.id,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    rotation: value.rotation,
    zIndex: value.zIndex,
  };
  if (value.type === "image" && isNonEmptyString(value.uri)) {
    return { ...base, type: "image", uri: value.uri };
  }
  if (value.type === "text"
    && typeof value.text === "string"
    && isNonEmptyString(value.fontStyle)
    && isValidHexColor(value.color)
    && isFiniteNumber(value.fontSize)
    && value.fontSize > 0
    && value.fontSize <= MAX_NATIVE_SAFE_FONT_SIZE) {
    return {
      ...base,
      type: "text",
      text: value.text,
      fontStyle: value.fontStyle,
      color: value.color,
      fontSize: value.fontSize,
    };
  }
  if (value.type === "sticker" && isNonEmptyString(value.stickerId)) {
    return { ...base, type: "sticker", stickerId: value.stickerId };
  }
  if (value.type === "frame" && isNonEmptyString(value.frameId)) {
    return { ...base, type: "frame", frameId: value.frameId };
  }
  return null;
}

function parseCanvasLayout(value: unknown): CanvasLayout | null {
  if (!isRecord(value)
    || !isFiniteNumber(value.aspectRatio)
    || value.aspectRatio <= 0
    || !Array.isArray(value.elements)
    || !hasOptionalString(value, "backgroundId")
    || (value.coverColor !== undefined && !isValidHexColor(value.coverColor))
    || !hasOptionalString(value, "coverImage")) {
    return null;
  }
  const elements = value.elements.map(parseCanvasElement);
  if (elements.some((element) => element === null)) return null;
  const photoTemplateId = typeof value.photoTemplateId === "string"
    ? resolvePhotoTemplate(value.photoTemplateId)?.id
    : undefined;
  const photoPlanVersion = value.photoPlanVersion === 1 ? 1 as const : undefined;

  return normalizeLayout({
    aspectRatio: value.aspectRatio,
    ...(photoPlanVersion ? { photoPlanVersion } : {}),
    ...(photoTemplateId ? { photoTemplateId } : {}),
    ...(typeof value.backgroundId === "string" && value.backgroundId ? { backgroundId: value.backgroundId } : {}),
    ...(typeof value.coverColor === "string" && value.coverColor ? { coverColor: value.coverColor } : {}),
    ...(typeof value.coverImage === "string" && value.coverImage ? { coverImage: value.coverImage } : {}),
    elements: elements as CanvasElement[],
  });
}

function parseStoryPage(value: unknown): StoryPage | null {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !Number.isInteger(value.position)
    || (value.position as number) < 0
    || (value.kind !== "cover" && value.kind !== "photo" && value.kind !== "closing")
    || typeof value.headline !== "string"
    || typeof value.body !== "string"
    || !hasOptionalString(value, "photoUri")
    || (value.coverColor !== undefined && !isValidHexColor(value.coverColor))
    || !hasOptionalString(value, "coverImage")) {
    return null;
  }
  const layout = value.layout === undefined ? undefined : parseCanvasLayout(value.layout);
  if (value.layout !== undefined && !layout) return null;

  return {
    id: value.id,
    position: value.position as number,
    kind: value.kind,
    headline: value.headline,
    body: value.body,
    ...(value.photoUri !== undefined ? { photoUri: value.photoUri as string } : {}),
    ...(layout ? { layout } : {}),
    ...(value.coverColor !== undefined ? { coverColor: value.coverColor as string } : {}),
    ...(value.coverImage !== undefined ? { coverImage: value.coverImage as string } : {}),
  };
}

function parseAndNormalizePages(value: unknown): StoryPage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const pages = value.map(parseStoryPage);
  if (pages.some((page) => page === null)) return null;
  const safePages = pages as StoryPage[];
  if (new Set(safePages.map((page) => page.id)).size !== safePages.length) return null;
  return normalizeStoryPages(safePages);
}

export async function saveMemoryEditDraft(
  db: SQLiteDatabase,
  memory: Memory,
  pages: StoryPage[],
  accountKey: LocalLibraryOwner,
) {
  await migrateMemoryEditDrafts(db);
  const normalizedPages = parseAndNormalizePages(pages);
  if (!normalizedPages) throw new Error("Cannot persist unsafe memory edit draft pages");
  const result = await db.runAsync(
    `INSERT INTO memory_edit_drafts
      (memory_id, owner_account_key, base_updated_at, pages_json, updated_at)
      SELECT memory.id, memory.ownerAccountKey, memory.updatedAt, ?, ?
      FROM memories AS memory
      WHERE memory.id = ?
        AND memory.ownerAccountKey = ?
        AND memory.updatedAt = ?
        AND (memory.status IS NULL OR memory.status = 'saved')
      ON CONFLICT(memory_id, owner_account_key) DO UPDATE SET
        base_updated_at = excluded.base_updated_at,
        pages_json = excluded.pages_json,
        updated_at = excluded.updated_at`,
    JSON.stringify(normalizedPages),
    new Date().toISOString(),
    memory.id,
    accountKey,
    memory.updatedAt,
  );
  if (result.changes === 0) {
    throw new Error("Cannot persist recovery draft for stale or unowned memory");
  }
}

async function discardObservedDraft(
  db: SQLiteDatabase,
  memoryId: string,
  accountKey: LocalLibraryOwner,
  row: MemoryEditDraftRow,
) {
  try {
    await db.runAsync(
      `DELETE FROM memory_edit_drafts
        WHERE memory_id = ?
          AND owner_account_key = ?
          AND base_updated_at = ?
          AND updated_at = ?
          AND pages_json = ?`,
      memoryId,
      accountKey,
      row.base_updated_at,
      row.updated_at,
      row.pages_json,
    );
  } catch {
    // Recovery is best-effort; cleanup failure must not block opening the editor.
  }
}

export async function getMemoryEditDraft(
  db: SQLiteDatabase,
  memory: Memory,
  accountKey: LocalLibraryOwner,
): Promise<StoryPage[] | null> {
  await migrateMemoryEditDrafts(db);
  const row = await db.getFirstAsync<MemoryEditDraftRow>(
    `SELECT base_updated_at, pages_json, updated_at
      FROM memory_edit_drafts
      WHERE memory_id = ? AND owner_account_key = ?`,
    memory.id,
    accountKey,
  );
  if (!row) return null;
  if (row.base_updated_at !== memory.updatedAt) {
    await discardObservedDraft(db, memory.id, accountKey, row);
    localDiagnostics.emit("recovery_discarded", {
      memoryId: memory.id,
      reason: "stale",
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.pages_json) as unknown;
  } catch {
    await discardObservedDraft(db, memory.id, accountKey, row);
    localDiagnostics.emit("recovery_discarded", {
      memoryId: memory.id,
      reason: "corrupt",
    });
    return null;
  }
  const pages = parseAndNormalizePages(parsed);
  if (!pages) {
    await discardObservedDraft(db, memory.id, accountKey, row);
    localDiagnostics.emit("recovery_discarded", {
      memoryId: memory.id,
      reason: "corrupt",
    });
    return null;
  }
  return pages;
}

export async function clearMemoryEditDraft(
  db: SQLiteDatabase,
  memoryId: string,
  accountKey: LocalLibraryOwner,
) {
  await migrateMemoryEditDrafts(db);
  await db.runAsync(
    "DELETE FROM memory_edit_drafts WHERE memory_id = ? AND owner_account_key = ?",
    memoryId,
    accountKey,
  );
}
