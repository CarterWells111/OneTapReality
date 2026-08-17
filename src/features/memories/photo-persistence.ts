import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

import { localAccountDirectorySegment } from "../auth/local-account";
import type { CanvasLayout, Memory } from "../../types/memory";

// ---------------------------------------------------------------------------
// 照片持久化：把选取器返回的 URI 复制进应用沙盒（documentDirectory），
// 防止 ph:// / content:// / 缓存 file:// 在系统清理或授权过期后失效
// （此前照片 URI 原样入库，重开后全部丢失）。
// 所有操作 best-effort：失败一律返回原 URI，不打断用户流程。
// ---------------------------------------------------------------------------

/** 单张图片复制失败的并发上限（规范 §10：禁止裸 Promise.all）。 */
const PERSIST_CONCURRENCY = 3;

async function getPhotosDirectory(accountKey: string, memoryId: string): Promise<string> {
  const directory = `${FileSystem.documentDirectory}photos/accounts/${localAccountDirectorySegment(accountKey)}/${encodeURIComponent(memoryId)}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return directory;
}

function getAccountPhotosDirectory(accountKey: string): string {
  return `${FileSystem.documentDirectory}photos/accounts/${localAccountDirectorySegment(accountKey)}/`;
}

function isLegacySandboxPhotoUri(uri: string): boolean {
  const photosRoot = `${FileSystem.documentDirectory}photos/`;
  return uri.startsWith(photosRoot) && !uri.startsWith(`${photosRoot}accounts/`);
}

export async function deleteMemoryPhotoDirectory(accountKey: string, memoryId: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(`${getAccountPhotosDirectory(accountKey)}${encodeURIComponent(memoryId)}/`, { idempotent: true });
  } catch (error) {
    console.warn("[photo-persistence] 无法清理相册照片目录：", error);
  }
}

export async function deleteAccountPhotoDirectory(accountKey: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(getAccountPhotosDirectory(accountKey), { idempotent: true });
  } catch (error) {
    console.warn("[photo-persistence] 无法清理账号照片目录：", error);
  }
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

/**
 * 把一张照片 URI 复制进应用沙盒，返回持久化后的 URI。
 * 已在沙盒内的直接返回；复制失败返回原 URI（调用方决定是否兜底）。
 */
export async function persistPhotoUriStrict(uri: string, accountKey: string, memoryId: string): Promise<string> {
  const directory = await getPhotosDirectory(accountKey, memoryId);
  if (isPersisted(uri, directory)) return uri;
  let sourceUri = uri;
  if (uri.startsWith("ph://")) {
    sourceUri = await resolvePhUri(uri);
    if (isPersisted(sourceUri, directory)) return sourceUri;
  }
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${getExtension(sourceUri)}`;
  const destination = `${directory}${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

export async function persistPhotoUri(uri: string, accountKey: string, memoryId: string): Promise<string> {
  try {
    return await persistPhotoUriStrict(uri, accountKey, memoryId);
  } catch (error) {
    console.warn("[photo-persistence] 照片复制失败，保留原 URI：", error);
    return uri;
  }
}

/** 并发 3 地持久化一组 URI（规范 §10：禁止裸 Promise.all 并发）。 */
export async function persistPhotoUris(uris: readonly string[], accountKey: string, memoryId: string): Promise<string[]> {
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
  const referenced = new Set(memories.flatMap(collectMemoryPhotoUris));
  for (const uri of new Set(candidates)) {
    if (!isLegacySandboxPhotoUri(uri) || referenced.has(uri)) continue;
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (error) {
      console.warn("[photo-persistence] 无法清理已迁移的旧照片：", error);
    }
  }
}

/**
 * 持久化一个记忆内全部照片 URI（页面布局 image 元素、封面图、photoUris 列表），
 * 替换映射写回。返回持久化后的记忆与是否发生过变更。
 * 旧数据迁移入口：读取记忆后调用，变更时把结果写回数据库。
 */
export async function ensureMemoryPhotosPersisted(
  memory: Memory,
  accountKey: string,
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
