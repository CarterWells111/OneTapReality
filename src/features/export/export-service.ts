import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";
import type { StoryPage } from "../../types/memory";

/**
 * 导出服务：将手账页面导出为图片、PDF 或自定义 .tralbum 格式。
 */

export type ExportFormat = "png" | "pdf" | "tralbum";

/** 单页导出结果 */
export type PageExportResult = {
  pageIndex: number;
  uri: string;
};

/**
 * 将页面渲染为 PNG 图片（需要配合 ViewShot 或 Canvas 截图使用）。
 * 这里提供接口框架，实际截图由调用方通过 ref 获取。
 */
export async function capturePageAsPng(
  _page: StoryPage,
  _pageIndex: number,
): Promise<PageExportResult> {
  // 实际截图需要 ViewShot ref 或 Canvas API
  // 这里提供框架供后续集成
  throw new Error("截图功能需要配合 ViewShot 组件使用");
}

/**
 * 将多张 PNG 图片合并为一个 PDF 文件。
 * 使用 expo-print 的 HTML → PDF 能力。
 */
export async function mergeImagesToPdf(
  imageUris: string[],
  outputPath?: string,
): Promise<string> {
  const imagesHtml = imageUris
    .map(
      (uri) =>
        `<img src="${uri}" style="width:100%;page-break-after:always;" />`,
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    @page { margin: 0; size: A4; }
    body { margin: 0; padding: 0; }
    img { display: block; width: 100%; height: auto; }
  </style>
</head>
<body>${imagesHtml}</body>
</html>`;

  // expo-print 需要原生模块，在 Expo Go 中可用
  const { printToFileAsync } = await import("expo-print");
  const result = await printToFileAsync({
    html,
    base64: false,
  });

  if (outputPath) {
    await FileSystem.moveAsync({
      from: result.uri,
      to: outputPath,
    });
    return outputPath;
  }

  return result.uri;
}

/**
 * 分享文件。
 */
export async function shareFile(uri: string, mimeType?: string) {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("当前设备不支持分享");
  }
  await Sharing.shareAsync(uri, {
    mimeType: mimeType ?? "application/octet-stream",
    dialogTitle: "分享旅行手账",
  });
}

/**
 * 保存图片到相册。
 */
export async function saveImageToGallery(uri: string): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error("需要相册权限才能保存图片");
  }
  await MediaLibrary.saveToLibraryAsync(uri);
}

/**
 * 导出为 .tralbum 自定义格式（JSON + base64 素材）。
 */
export function exportAsTralbumFormat(
  pages: StoryPage[],
  title: string,
): string {
  const tralbumData = {
    version: "1.0.0",
    app: "OneTapReality",
    title,
    exportedAt: new Date().toISOString(),
    pages: pages.map((page) => ({
      id: page.id,
      kind: page.kind,
      headline: page.headline,
      body: page.body,
      layout: page.layout,
      // 注意：photoUri 是本地路径，分享给他人后不可用
      // 实际使用时需要转为 base64 或使用共享存储
    })),
  };

  return JSON.stringify(tralbumData, null, 2);
}

/**
 * 解析 .tralbum 格式。
 */
export function parseTralbumFormat(json: string): {
  version: string;
  title: string;
  pages: StoryPage[];
} | null {
  try {
    const data = JSON.parse(json);
    if (data.version && data.app === "OneTapReality" && Array.isArray(data.pages)) {
      return {
        version: data.version,
        title: data.title ?? "未命名手账",
        pages: data.pages,
      };
    }
    return null;
  } catch {
    return null;
  }
}
