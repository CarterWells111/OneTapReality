import { Alert } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";

import {
  type ExportFormat,
  exportAsTralbumFormat,
} from "./export-service";
import type { StoryPage } from "../../types/memory";

type ShareTarget = {
  pages: StoryPage[];
  title: string;
};

/**
 * 导出/分享 ActionSheet。
 *
 * 把导出选项（PDF/.tralbum）对接到底层的 expo 能力。
 */

const EXPORT_OPTIONS: { label: string; format: ExportFormat }[] = [
  { label: "导出为 PDF", format: "pdf" },
  { label: "导出为 .tralbum 格式", format: "tralbum" },
];

export async function showShareActionSheet(target: ShareTarget) {
  const { pages, title } = target;

  Alert.alert(
    "分享旅行手账",
    `"${title}" 导出为：`,
    [
      ...EXPORT_OPTIONS.map((opt) => ({
        text: opt.label,
        onPress: () => handleExport(opt.format, pages, title),
      })),
      { text: "取消", style: "cancel" as const },
    ],
  );
}

async function handleExport(format: ExportFormat, pages: StoryPage[], title: string) {
  try {
    switch (format) {
      case "pdf":
        await exportPdf(pages, title);
        break;
      case "tralbum":
        await exportTralbum(pages, title);
        break;
      case "png":
        await exportPng(pages, title);
        break;
    }
  } catch (err: any) {
    Alert.alert("导出失败", err instanceof Error ? err.message : String(err));
  }
}

/**
 * 将每页内容渲染为 HTML div，再用 expo-print 合并为 PDF。
 *
 * 每页的 HTML 结构按优先级包含：
 *   1. layout.coverImage → 封面背景图
 *   2. layout 中的 image 元素 → <img> 标签
 *   3. layout.coverColor / backgroundId → 背景色
 *   4. headline + body → 文字内容
 *
 * 纯文字页（无 layout 时）：直接渲染 headline + body。
 */
async function exportPdf(pages: StoryPage[], title: string) {
  const pageHtmls = pages.map(pageToHtml).filter(Boolean);

  if (pageHtmls.length === 0) {
    Alert.alert("无法导出", "当前旅行册没有可导出的内容。");
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 0; size: A4 portrait; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
    .page {
      page-break-after: always;
      width: 100%;
      height: 100vh;
      overflow: hidden;
      position: relative;
    }
    .page:last-child { page-break-after: auto; }
    .bg-image {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      object-fit: cover;
    }
    .element-img {
      position: absolute;
      object-fit: contain;
    }
    .element-text {
      position: absolute;
      color: #1C2C28;
      font-weight: 600;
    }
    .cover-body {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100%;
      padding: 40px;
      text-align: center;
    }
    .cover-headline {
      font-size: 28px;
      font-weight: 800;
      color: #1C2C28;
      margin-bottom: 12px;
    }
    .cover-meta {
      font-size: 15px;
      color: #56708A;
    }
    .text-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 40px;
      height: 100%;
    }
    .text-headline {
      font-size: 22px;
      font-weight: 800;
      color: #1C2C28;
      margin-bottom: 10px;
    }
    .text-body {
      font-size: 15px;
      color: #56708A;
      line-height: 1.6;
    }
  </style>
</head>
<body>${pageHtmls.join("\n")}</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `分享「${title}」PDF`,
    });
  } else {
    Alert.alert("PDF 已生成", `文件路径：${uri}`);
  }
}

/** 将单页 StoryPage 转换为 HTML div。 */
function pageToHtml(page: StoryPage): string {
  const layout = page.layout;
  const isCover = page.kind === "cover";

  // ---- 有 layout 的页面（画布编辑页） ----
  if (layout) {
    const bgColor = layout.coverColor ?? "#EFE2CF";
    const bgImage = layout.coverImage;

    // 收集 image 元素和 text 元素的绝对定位样式
    const images = layout.elements
      .filter((el) => el.type === "image" && el.uri)
      .map((el) => {
        // 使用百分比定位（相对于父容器宽高）
        return `<img class="element-img" src="${escapeHtml(el.uri)}" style="left:${(el.x * 100).toFixed(1)}%;top:${(el.y * 100).toFixed(1)}%;width:${(el.width * 100).toFixed(1)}%;height:${(el.height * 100).toFixed(1)}%;" />`;
      })
      .join("\n");

    const texts = layout.elements
      .filter((el) => el.type === "text" && el.text)
      .map((el) => {
        const fontSize = el.fontSize ?? 16;
        return `<div class="element-text" style="left:${(el.x * 100).toFixed(1)}%;top:${(el.y * 100).toFixed(1)}%;width:${(el.width * 100).toFixed(1)}%;font-size:${fontSize}px;color:${escapeHtml(el.color ?? "#1C2C28")};">${escapeHtml(el.text)}</div>`;
      })
      .join("\n");

    const bgImgTag = bgImage
      ? `<img class="bg-image" src="${escapeHtml(bgImage)}" />`
      : "";

    return `<div class="page" style="background-color:${escapeHtml(bgColor)};">
      ${bgImgTag}
      ${images}
      ${texts}
    </div>`;
  }

  // ---- 无 layout 的纯文字页（如示例记忆） ----
  if (isCover) {
    return `<div class="page" style="background-color:${page.coverColor ?? "#EFE2CF"};">
      <div class="cover-body">
        <div class="cover-headline">${escapeHtml(page.headline)}</div>
        <div class="cover-meta">${escapeHtml(page.body)}</div>
      </div>
    </div>`;
  }

  return `<div class="page" style="background-color: #F7F2EA;">
    <div class="text-page">
      <div class="text-headline">${escapeHtml(page.headline)}</div>
      <div class="text-body">${escapeHtml(page.body)}</div>
    </div>
  </div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 导出为 .tralbum JSON 格式，写入临时文件后调起分享。
 */
async function exportTralbum(pages: StoryPage[], title: string) {
  const json = exportAsTralbumFormat(pages, title);
  const fileName = sanitizeFilename(title) || "tralbum";
  const fileUri = `${FileSystem.cacheDirectory}${fileName}.tralbum`;
  await FileSystem.writeAsStringAsync(fileUri, json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/octet-stream",
      dialogTitle: `分享「${title}」.tralbum`,
    });
  } else {
    Alert.alert("文件已生成", `可在以下路径找到：${fileUri}`);
  }
}

/**
 * 暂不支持逐页截图。
 */
async function exportPng(_pages: StoryPage[], _title: string) {
  Alert.alert("提示", "图片导出需要配合截图组件，当前版本暂不支持逐页 PNG 导出。请使用 PDF 格式。");
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").slice(0, 64);
}
