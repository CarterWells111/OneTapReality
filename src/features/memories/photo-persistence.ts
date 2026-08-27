import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

import { localAccountDirectorySegment } from "../auth/local-account";
import type { LocalLibraryOwner } from "../auth/local-library-owner";
import type { CanvasLayout, Memory } from "../../types/memory";
import {
  createMissingPhotoToken,
  isMissingPhotoToken,
  rebaseLegacyAccountPhotoUri,
  resolveCanonicalPhotoReference,
  toCanonicalPhotoReference,
} from "./photo-references";

// ---------------------------------------------------------------------------
// 照片持久化：把选取器返回的 URI 复制进应用沙盒（documentDirectory），
// 防止 ph:// / content:// / 缓存 file:// 在系统清理或授权过期后失效
// （此前照片 URI 原样入库，重开后全部丢失）。
// 所有操作 best-effort：失败一律返回原 URI，不打断用户流程。
// ---------------------------------------------------------------------------

/** 单张图片复制失败的并发上限（规范 §10：禁止裸 Promise.all）。 */
const PERSIST_CONCURRENCY = 3;

export type PhotoLocation =
  | { kind: "memory-photo"; position: number }
  | { kind: "memory-cover" }
  | { kind: "page-photo"; pageId: string }
  | { kind: "layout-cover"; pageId: string }
  | { kind: "layout-image"; pageId: string; elementId: string };

export type PhotoHydrationResult = {
  runtimeMemory: Memory;
  storageMemory: Memory;
  changed: boolean;
  unresolved: {
    token: `missing-local-photo://${string}`;
    location: PhotoLocation;
    storedReference: string;
  }[];
};

async function getPhotosDirectory(accountKey: LocalLibraryOwner, memoryId: string): Promise<string> {
  const directory = `${FileSystem.documentDirectory}photos/accounts/${localAccountDirectorySegment(accountKey)}/${encodeURIComponent(memoryId)}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return directory;
}

function getAccountPhotosDirectory(accountKey: LocalLibraryOwner): string {
  return `${FileSystem.documentDirectory}photos/accounts/${localAccountDirectorySegment(accountKey)}/`;
}

function isLegacySandboxPhotoUri(uri: string): boolean {
  const photosRoot = `${FileSystem.documentDirectory}photos/`;
  return uri.startsWith(photosRoot) && !uri.startsWith(`${photosRoot}accounts/`);
}

function isAccountScopedPhotoUri(uri: string): boolean {
  return uri.startsWith("file://") && uri.includes("/photos/accounts/");
}

export async function deleteMemoryPhotoDirectory(accountKey: LocalLibraryOwner, memoryId: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(`${getAccountPhotosDirectory(accountKey)}${encodeURIComponent(memoryId)}/`, { idempotent: true });
  } catch (error) {
    console.warn("[photo-persistence] 无法清理相册照片目录：", error);
  }
}

export async function deleteAccountPhotoDirectory(accountKey: LocalLibraryOwner): Promise<void> {
  try {
    await deleteAccountPhotoDirectoryStrict(accountKey);
  } catch (error) {
    console.warn("[photo-persistence] 无法清理账号照片目录：", error);
  }
}

/** Account deletion must fail closed so the UI can retry or direct the user to support. */
export async function deleteAccountPhotoDirectoryStrict(accountKey: LocalLibraryOwner): Promise<void> {
  await FileSystem.deleteAsync(getAccountPhotosDirectory(accountKey), { idempotent: true });
}

function getExtension(uri: string): string {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(uri);
  return match ? match[1].toLowerCase() : "jpg";
}

/** ph://<assetId> 需要先经媒体库解析出本地文件路径，再复制。 */
async function resolvePhUri(uri: string): Promise<string> {
  const assetId = uri.replace(/^ph:\/\//, "");
  const asset = await MediaLibrary.getAssetInfoAsync(assetId);
  return asset.localUri ?? uri;
}

function isPersisted(uri: string, directory: string): boolean {
  return uri.startsWith(directory);
}

async function allocatePhotoDestination(directory: string, extension: string): Promise<string> {
  const stem = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const destination = `${directory}${stem}-${attempt}.${extension}`;
    const info = await FileSystem.getInfoAsync(destination);
    if (!info.exists) return destination;
  }
  throw new Error("无法为照片分配安全的本地文件名");
}

export type StagedPhotoFile = {
  uri: string;
  commit: () => void;
  rollback: () => Promise<void>;
};

function existingPhotoHandle(uri: string): StagedPhotoFile {
  return {
    uri,
    commit: () => undefined,
    rollback: async () => undefined,
  };
}

function createdPhotoHandle(uri: string): StagedPhotoFile {
  let committed = false;
  let rollbackPromise: Promise<void> | null = null;
  return {
    uri,
    commit: () => {
      committed = true;
    },
    rollback: async () => {
      if (committed) return;
      if (!rollbackPromise) {
        rollbackPromise = FileSystem.deleteAsync(uri, { idempotent: true }).catch((error) => {
          rollbackPromise = null;
          throw error;
        });
      }
      await rollbackPromise;
    },
  };
}

/**
 * Copies one picker URI into the album directory while retaining ownership of
 * that exact destination until the caller commits it. Existing album files are
 * represented by no-op handles and can therefore never be removed by rollback.
 */
export async function stagePhotoUriStrict(
  uri: string,
  accountKey: LocalLibraryOwner,
  memoryId: string,
): Promise<StagedPhotoFile> {
  const directory = await getPhotosDirectory(accountKey, memoryId);
  if (isPersisted(uri, directory)) return existingPhotoHandle(uri);
  let sourceUri = uri;
  if (uri.startsWith("ph://")) {
    sourceUri = await resolvePhUri(uri);
    if (isPersisted(sourceUri, directory)) return existingPhotoHandle(sourceUri);
  }
  const destination = await allocatePhotoDestination(directory, getExtension(sourceUri));
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    const destinationInfo = await FileSystem.getInfoAsync(destination);
    if (!destinationInfo.exists || destinationInfo.isDirectory) {
      throw new Error("Photo destination verification failed");
    }
  } catch (error) {
    try {
      await FileSystem.deleteAsync(destination, { idempotent: true });
    } catch (cleanupError) {
      console.warn("[photo-persistence] 无法清理复制失败的照片：", cleanupError);
    }
    throw error;
  }
  return createdPhotoHandle(destination);
}

/**
 * 把一张照片 URI 复制进应用沙盒，返回持久化后的 URI。
 * 已在沙盒内的直接返回；复制失败返回原 URI（调用方决定是否兜底）。
 */
export async function persistPhotoUriStrict(uri: string, accountKey: LocalLibraryOwner, memoryId: string): Promise<string> {
  const staged = await stagePhotoUriStrict(uri, accountKey, memoryId);
  staged.commit();
  return staged.uri;
}

export async function persistPhotoUri(uri: string, accountKey: LocalLibraryOwner, memoryId: string): Promise<string> {
  return persistPhotoUriStrict(uri, accountKey, memoryId);
}

/** 并发 3 地持久化一组 URI（规范 §10：禁止裸 Promise.all 并发）。 */
export async function persistPhotoUris(uris: readonly string[], accountKey: LocalLibraryOwner, memoryId: string): Promise<string[]> {
  const results = new Array<string>(uris.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < uris.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await persistPhotoUri(uris[index], accountKey, memoryId);
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(PERSIST_CONCURRENCY, uris.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function isExistingFile(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory;
}

type HydratedUri = {
  runtime: string;
  storage: string;
  token?: `missing-local-photo://${string}`;
};

async function hydratePhotoUri(uri: string, accountKey: LocalLibraryOwner, memoryId: string): Promise<HydratedUri> {
  const missing = (): HydratedUri => {
    const token = createMissingPhotoToken();
    return { runtime: token, storage: uri, token };
  };
  if (isMissingPhotoToken(uri)) {
    return { runtime: uri, storage: uri, token: uri as `missing-local-photo://${string}` };
  }

  const canonicalRuntime = resolveCanonicalPhotoReference(uri, accountKey, memoryId);
  if (canonicalRuntime) {
    return await isExistingFile(canonicalRuntime)
      ? { runtime: canonicalRuntime, storage: uri }
      : missing();
  }

  const directCanonical = toCanonicalPhotoReference(uri, accountKey, memoryId);
  if (directCanonical && await isExistingFile(uri)) {
    return { runtime: uri, storage: directCanonical };
  }

  const rebasedRuntime = rebaseLegacyAccountPhotoUri(uri, accountKey, memoryId);
  if (rebasedRuntime) {
    if (await isExistingFile(rebasedRuntime)) {
      const storage = toCanonicalPhotoReference(rebasedRuntime, accountKey, memoryId);
      if (storage) return { runtime: rebasedRuntime, storage };
    }
    return missing();
  }

  // An app-owned account directory is never an external import source. If it
  // did not validate for this exact account and album above, copying it would
  // turn a stale or foreign reference into a cross-account photo leak.
  if (isAccountScopedPhotoUri(uri)) return missing();

  try {
    const runtime = await persistPhotoUriStrict(uri, accountKey, memoryId);
    const storage = toCanonicalPhotoReference(runtime, accountKey, memoryId);
    if (!storage) throw new Error("Persisted photo was outside the expected album directory");
    return { runtime, storage };
  } catch {
    return missing();
  }
}

async function hydrateUniqueUris(
  uris: readonly string[],
  accountKey: LocalLibraryOwner,
  memoryId: string,
): Promise<Map<string, HydratedUri>> {
  const values = [...new Set(uris)];
  const results = new Map<string, HydratedUri>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const uri = values[index];
      results.set(uri, await hydratePhotoUri(uri, accountKey, memoryId));
    }
  };
  await Promise.all(Array.from({ length: Math.min(PERSIST_CONCURRENCY, values.length) }, worker));
  return results;
}

/** Converts stored photo references into current runtime URIs without exposing storage references to UI. */
export async function hydrateMemoryPhotoReferences(
  memory: Memory,
  accountKey: LocalLibraryOwner,
): Promise<PhotoHydrationResult> {
  const allUris = collectMemoryPhotoUris(memory);
  const hydrated = await hydrateUniqueUris(allUris, accountKey, memory.id);
  const unresolved: PhotoHydrationResult["unresolved"] = [];
  let changed = false;

  const mapUri = (uri: string | undefined, location: PhotoLocation): { runtime: string | undefined; storage: string | undefined } => {
    if (!uri) return { runtime: uri, storage: uri };
    const result = hydrated.get(uri)!;
    if (result.storage !== uri) changed = true;
    if (result.token) {
      // A single stored URI can occur in several independent locations. Each
      // occurrence needs its own UI token so a later edit/reorder can restore
      // the exact stored reference from the provider baseline.
      const token = createMissingPhotoToken();
      unresolved.push({ token, location, storedReference: uri });
      return { runtime: token, storage: result.storage };
    }
    return { runtime: result.runtime, storage: result.storage };
  };

  const photos = memory.photoUris.map((uri, position) => mapUri(uri, { kind: "memory-photo", position }));
  const cover = mapUri(memory.coverImage, { kind: "memory-cover" });
  const pages = memory.pages.map((page) => {
    const pagePhoto = mapUri(page.photoUri, { kind: "page-photo", pageId: page.id });
    if (!page.layout) {
      return {
        runtime: { ...page, photoUri: pagePhoto.runtime },
        storage: { ...page, photoUri: pagePhoto.storage },
      };
    }
    const layoutCover = mapUri(page.layout.coverImage, { kind: "layout-cover", pageId: page.id });
    const elements = page.layout.elements.map((element) => {
      if (element.type !== "image") return { runtime: element, storage: element };
      const image = mapUri(element.uri, { kind: "layout-image", pageId: page.id, elementId: element.id });
      return {
        runtime: { ...element, uri: image.runtime ?? element.uri },
        storage: { ...element, uri: image.storage ?? element.uri },
      };
    });
    return {
      runtime: {
        ...page,
        photoUri: pagePhoto.runtime,
        layout: { ...page.layout, coverImage: layoutCover.runtime, elements: elements.map((entry) => entry.runtime) },
      },
      storage: {
        ...page,
        photoUri: pagePhoto.storage,
        layout: { ...page.layout, coverImage: layoutCover.storage, elements: elements.map((entry) => entry.storage) },
      },
    };
  });

  return {
    runtimeMemory: {
      ...memory,
      coverImage: cover.runtime,
      photoUris: photos.map((entry) => entry.runtime!),
      pages: pages.map((entry) => entry.runtime),
    },
    storageMemory: {
      ...memory,
      coverImage: cover.storage,
      photoUris: photos.map((entry) => entry.storage!),
      pages: pages.map((entry) => entry.storage),
    },
    changed,
    unresolved,
  };
}

function collectLayoutUris(layout: CanvasLayout): string[] {
  const uris: string[] = [];
  for (const element of layout.elements) {
    if (element.type === "image") {
      uris.push(element.uri);
    }
  }
  if (layout.coverImage) {
    uris.push(layout.coverImage);
  }
  return uris;
}

function collectMemoryPhotoUris(memory: Memory): string[] {
  const uris = memory.photoUris.slice();
  if (memory.coverImage) uris.push(memory.coverImage);
  for (const page of memory.pages) {
    if (page.photoUri) uris.push(page.photoUri);
    if (page.layout) uris.push(...collectLayoutUris(page.layout));
  }
  return uris;
}

export function findMigratedLegacyPhotoUris(before: Memory, after: Memory): string[] {
  const remaining = new Set(collectMemoryPhotoUris(after));
  return [...new Set(collectMemoryPhotoUris(before))]
    .filter((uri) => isLegacySandboxPhotoUri(uri) && !remaining.has(uri));
}

export async function cleanupMigratedLegacyPhotoUris(
  candidates: readonly string[],
  memories: readonly Memory[],
): Promise<void> {
  // Pre-account files may still be referenced by another account, draft, or recycle-bin row.
  // A global reference scan is intentionally outside this account-scoped migration.
  void candidates;
  void memories;
}

/**
 * 持久化一个记忆内全部照片 URI（页面布局 image 元素、封面图、photoUris 列表），
 * 替换映射写回。返回持久化后的记忆与是否发生过变更。
 * 旧数据迁移入口：读取记忆后调用，变更时把结果写回数据库。
 */
export async function ensureMemoryPhotosPersisted(
  memory: Memory,
  accountKey: LocalLibraryOwner,
): Promise<{ memory: Memory; changed: boolean }> {
  const allUris = collectMemoryPhotoUris(memory);
  const uniqueUris = [...new Set(allUris)];
  const persisted = await persistPhotoUris(uniqueUris, accountKey, memory.id);
  const uriMap = new Map<string, string>();
  uniqueUris.forEach((uri, index) => {
    if (persisted[index] !== uri) {
      uriMap.set(uri, persisted[index]);
    }
  });
  if (uriMap.size === 0) {
    return { memory, changed: false };
  }

  const replace = (uri: string | undefined): string | undefined =>
    uri ? (uriMap.get(uri) ?? uri) : uri;

  const pages = memory.pages.map((page) => {
    const photoUri = replace(page.photoUri);
    let layout = page.layout;
    if (layout) {
      const elements = layout.elements.map((element) =>
        element.type === "image" ? { ...element, uri: replace(element.uri) ?? element.uri } : element,
      );
      layout = { ...layout, elements, coverImage: replace(layout.coverImage) };
    }
    return { ...page, photoUri, layout };
  });

  return {
    memory: {
      ...memory,
      coverImage: replace(memory.coverImage),
      photoUris: memory.photoUris.map((uri) => replace(uri) ?? uri),
      pages,
    },
    changed: true,
  };
}
