import { Alert } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";

import {
  type ExportFormat,
  exportAsTralbumFormat,
} from "./export-service";
import { capturePagesAsImages } from "./page-capture-provider";
import type { StoryPage } from "../../types/memory";

type ShareTarget = {
  pages: StoryPage[];
  title: string;
};

/**
 * 导出/分享 ActionSheet。
 *
 * PDF 导出通过逐页渲染截图 → data-URI → HTML → expo-print 实现，
 * 保证边框、贴纸、背景和自定义字体 100% 还原。
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
 * PDF 导出策略：截图优先 + HTML 回退。
 *
 * 页面渲染逻辑：
 *   - 有 layout → 用 CanvasPage 组件渲染并 captureRef 截图（保留边框/贴纸/背景/字体）
 *   - 无 layout → 回退到纯 HTML 渲染（旧版纯文字页，如示例记忆）
 *
 * 尺寸选择：
 *   阅读器和编辑器使用 360×480（3:4），取 3x scale → 1080×1440 输出。
 *   expo-print 默认 72 PPI，按 A4 宽度 210mm (8.27in) ≈ 595pt，
 *   嵌入 1080px 图片可按 100% 宽填满页面。
 */
const PAGE_WIDTH = 360;
const PAGE_HEIGHT = 480;

async function exportPdf(pages: StoryPage[], title: string) {
  // 1. 逐页截图（有 layout 的页由 CanvasPage 渲染，无 layout 的返回 null）
  let captured: (string | null)[] = [];
  try {
    captured = await capturePagesAsImages(pages, PAGE_WIDTH, PAGE_HEIGHT);
  } catch (err) {
    console.warn("[PDF] 截图流程失败，回退到纯 HTML 导出:", err);
    // 截图失败 → 继续用纯 HTML 方案（全部 fallback）
  }

  // 2. 拼接 HTML：有截图的用截图，没截图的用 HTML
  const pageHtmls = pages.map((page, i) => {
    const dataUri = captured[i];
    if (dataUri) {
      // 截图成功 → 嵌入一页完整截图
      return `<div class="snap-page">
        <img class="snap-img" src="${dataUri}" alt="第 ${i + 1} 页" />
      </div>`;
    }
    // 无截图 → 回退到 HTML 布局渲染
    return pageToHtml(page);
  }).filter(Boolean);

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
    .snap-page {
      page-break-after: always;
      width: 100%;
      position: relative;
    }
    .snap-page:last-child { page-break-after: auto; }
    .snap-img {
      width: 100%;
      display: block;
      object-fit: contain;
    }
    /* ── 回退样式（无 layout 的纯文字页） ── */
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

/** 将单页 StoryPage 转换为 HTML div（回退方案，用于无 layout 的页面）。 */
function pageToHtml(page: StoryPage): string {
  const layout = page.layout;
  const isCover = page.kind === "cover";

  // ---- 有 layout 的页面（画布编辑页）—— HTML 回退 ----
  if (layout) {
    const bgColor = layout.coverColor ?? "#EFE2CF";
    const bgImage = layout.coverImage;

    const images = layout.elements
      .filter((el) => el.type === "image" && el.uri)
      .map((el) => {
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
