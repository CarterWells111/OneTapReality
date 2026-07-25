import type { StoryPage } from "../../types/memory";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/**
 * 导出服务：将手账页面导出为图片、PDF 或自定义 .tralbum 格式。
 *
 * PDF/分享/相册功能需要安装对应的 Expo 可选包：
 * - expo-print
 * - expo-sharing
 * - expo-file-system
 * - expo-media-library
 *
 * 如未安装，调用对应函数时会抛出友好错误。
 */

export type ExportFormat = "png" | "pdf" | "tralbum";

/** 单页导出结果 */
export type PageExportResult = {
  pageIndex: number;
  uri: string;
};

/**
 * 将页面渲染为 PNG 图片（需要配合 ViewShot 或 Canvas 截图使用）。
 */
export async function capturePageAsPng(
  _page: StoryPage,
  _pageIndex: number,
): Promise<PageExportResult> {
  throw new Error("截图功能需要配合 ViewShot 组件使用");
}

/**
 * 将多张 PNG 图片合并为一个 PDF 文件。
 * 使用 expo-print 的 HTML → PDF 能力。
 * 需要安装：expo-print, expo-file-system
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

  try {
    const result = await Print.printToFileAsync({ html, base64: false });

    if (outputPath) {
      await FileSystem.moveAsync({ from: result.uri, to: outputPath });
      return outputPath;
    }

    return result.uri;
  } catch {
    throw new Error("PDF 导出需要安装 expo-print 和 expo-file-system 包");
  }
}

/**
 * 分享文件。需要安装 expo-sharing。
 */
export async function shareFile(uri: string, mimeType?: string) {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error("当前设备不支持分享");
    }
    await Sharing.shareAsync(uri, {
      mimeType: mimeType ?? "application/octet-stream",
      dialogTitle: "分享旅行手账",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "当前设备不支持分享") throw err;
    throw new Error("分享功能需要安装 expo-sharing 包");
  }
}

/**
 * 保存图片到相册。需要安装 expo-media-library。
 */
export async function saveImageToGallery(uri: string): Promise<void> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      throw new Error("需要相册权限才能保存图片");
    }
    await MediaLibrary.saveToLibraryAsync(uri);
  } catch (err) {
    if (err instanceof Error && err.message === "需要相册权限才能保存图片") throw err;
    throw new Error("保存到相册需要安装 expo-media-library 包");
  }
}

/**
 * 导出为 .tralbum 自定义格式（纯 JSON，无外部依赖，完全离线可用）。
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
    })),
  };

  return JSON.stringify(tralbumData, null, 2);
}

/**
 * 解析 .tralbum 格式（纯 JSON，无外部依赖）。
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
