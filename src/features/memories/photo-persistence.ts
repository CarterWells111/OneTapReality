import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

import type { CanvasLayout, Memory } from "../../types/memory";

// ---------------------------------------------------------------------------
// 照片持久化：把选取器返回的 URI 复制进应用沙盒（documentDirectory），
// 防止 ph:// / content:// / 缓存 file:// 在系统清理或授权过期后失效
// （此前照片 URI 原样入库，重开后全部丢失）。
// 所有操作 best-effort：失败一律返回原 URI，不打断用户流程。
// ---------------------------------------------------------------------------

/** 单张图片复制失败的并发上限（规范 §10：禁止裸 Promise.all）。 */
const PERSIST_CONCURRENCY = 3;

const PHOTOS_DIR_NAME = "photos";

let photosDirReady: Promise<string> | null = null;

function getPhotosDirectory(): Promise<string> {
  if (!photosDirReady) {
    photosDirReady = FileSystem.makeDirectoryAsync(
      `${FileSystem.documentDirectory}${PHOTOS_DIR_NAME}`,
      { intermediates: true },
    )
      .then(() => `${FileSystem.documentDirectory}${PHOTOS_DIR_NAME}/`)
      .catch((error: unknown) => {
        photosDirReady = null;
        throw error;
      });
  }
  return photosDirReady;
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

function isPersisted(uri: string): boolean {
  const directory = FileSystem.documentDirectory;
  return directory !== null && uri.startsWith(directory);
}

/**
 * 把一张照片 URI 复制进应用沙盒，返回持久化后的 URI。
 * 已在沙盒内的直接返回；复制失败返回原 URI（调用方决定是否兜底）。
 */
export async function persistPhotoUri(uri: string): Promise<string> {
  if (isPersisted(uri)) {
    return uri;
  }
  let sourceUri = uri;
  if (uri.startsWith("ph://")) {
    sourceUri = await resolvePhUri(uri);
    if (isPersisted(sourceUri)) {
      return sourceUri;
    }
  }
  try {
    const directory = await getPhotosDirectory();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${getExtension(sourceUri)}`;
    const destination = `${directory}${fileName}`;
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    return destination;
  } catch (error) {
    console.warn("[photo-persistence] 照片复制失败，保留原 URI：", error);
    return uri;
  }
}

/** 并发 3 地持久化一组 URI（规范 §10：禁止裸 Promise.all 并发）。 */
export async function persistPhotoUris(uris: readonly string[]): Promise<string[]> {
  const results = new Array<string>(uris.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < uris.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await persistPhotoUri(uris[index]);
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

/**
 * 持久化一个记忆内全部照片 URI（页面布局 image 元素、封面图、photoUris 列表），
 * 替换映射写回。返回持久化后的记忆与是否发生过变更。
 * 旧数据迁移入口：读取记忆后调用，变更时把结果写回数据库。
 */
export async function ensureMemoryPhotosPersisted(
  memory: Memory,
): Promise<{ memory: Memory; changed: boolean }> {
  const allUris = memory.photoUris.slice();
  for (const page of memory.pages) {
    if (page.photoUri) {
      allUris.push(page.photoUri);
    }
    if (page.layout) {
      allUris.push(...collectLayoutUris(page.layout));
    }
  }
  const uniqueUris = [...new Set(allUris)];
  const persisted = await persistPhotoUris(uniqueUris);
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
      photoUris: memory.photoUris.map((uri) => replace(uri) ?? uri),
      pages,
    },
    changed: true,
  };
}
