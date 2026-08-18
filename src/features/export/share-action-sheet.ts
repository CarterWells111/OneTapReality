import { Alert } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";

import {
  type ExportFormat,
  exportAsTralbumFormat,
} from "./export-service";
import { capturePagesAsImages } from "./page-capture-provider";
import { hasMissingLocalPhotos, MISSING_LOCAL_PHOTO_ACTION_MESSAGE } from "../memories/local-photo-integrity";
import type { CanvasImageElement, CanvasTextElement, StoryPage } from "../../types/memory";

type ShareTarget = {
  coverImage?: string;
  pages: StoryPage[];
  photoUris?: string[];
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
  const { title } = target;

  Alert.alert(
    "分享旅行手账",
    `"${title}" 导出为：`,
    [
      ...EXPORT_OPTIONS.map((opt) => ({
        text: opt.label,
        onPress: () => handleExport(opt.format, target),
      })),
      { text: "取消", style: "cancel" as const },
    ],
  );
}

async function handleExport(format: ExportFormat, target: ShareTarget) {
  const { pages, title } = target;
  if (hasMissingLocalPhotos({ coverImage: target.coverImage, pages, photoUris: target.photoUris ?? [] })) {
    Alert.alert("无法导出", MISSING_LOCAL_PHOTO_ACTION_MESSAGE);
    return;
  }
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
 * 尺寸选择（关键）：
 *   App 页面是 360×480（3:4）。之前用 A4（210×297mm，约 1:1.414）作为 PDF 纸张，
 *   比例对不上，且 iOS/Android 打印引擎会忽略 CSS `@page size`，
 *   实际纸张是默认的 Letter（612×792pt）。于是 297mm 高的 div 超出纸张，
 *   每一页都溢出到下一页 → "半页内容 + 一条小尾巴 + 大段空白"。
 *
 *   修复：直接把 PDF 纸张设成 3:4（printToFileAsync 的 width/height，单位 pt），
 *   并让每页内容比纸张小 2pt，规避打印引擎的舍入误差。
 *   这样 App 一页 = PDF 一页，无空白、无跨页。
 */
const PAGE_WIDTH = 360;
const PAGE_HEIGHT = 480; // 3:4竖版

// PDF 纸张尺寸（pt = 1/72 inch），与 App 页面同为 3:4 竖版
const PDF_PAGE_W = 432;
const PDF_PAGE_H = 576;
// 内容盒略小于纸张：避免 "刚好等高" 被打印引擎判为溢出而多出一张空白页
const CONTENT_H = PDF_PAGE_H - 2;
const CONTENT_W = PDF_PAGE_W - 2;

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
  //    每页都是 body 的直接子元素，最后一页加 .last 取消分页符（否则尾部多一张空白页）
  const rawPages = pages
    .map((page, i) => {
      const dataUri = captured[i];
      if (dataUri) {
        // 截图成功 → 一整页就是一张图，不再包 div，减少一层可能溢出的盒子
        return `<img class="sheet" src="${dataUri}" alt="第 ${i + 1} 页" />`;
      }
      // 无截图 → 回退到 HTML 布局渲染
      return pageToHtml(page);
    })
    .filter(Boolean);

  const pageHtmls = rawPages.map((sheetHtml, i) =>
    i === rawPages.length - 1
      ? sheetHtml.replace(/class="sheet/, 'class="sheet last')
      : sheetHtml,
  );

  if (pageHtmls.length === 0) {
    Alert.alert("无法导出", "当前旅行册没有可导出的内容。");
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 0; size: ${PDF_PAGE_W}pt ${PDF_PAGE_H}pt; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${PDF_PAGE_W}pt;
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
    /* ── 每一页（截图或回退 HTML）都用同一个盒子尺寸 ──
       比纸张略小并水平居中，保证 1 页内容 = 1 页 PDF，不溢出、不留白。 */
    .sheet {
      display: block;
      width: ${CONTENT_W}pt;
      height: ${CONTENT_H}pt;
      margin: 0 auto;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* 最后一页不加分页符，否则尾部会多出一张空白页 */
    .sheet.last {
      page-break-after: auto;
      break-after: auto;
    }
    img.sheet { object-fit: cover; }
    /* ── 回退样式（无 layout 的纯文字页） ── */
    .page-fallback { position: relative; }
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

  // width/height 单位是 pt。显式指定纸张 + 零页边距，
  // 不再依赖 CSS @page（iOS 的 UIMarkupTextPrintFormatter 会忽略它）。
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: PDF_PAGE_W,
    height: PDF_PAGE_H,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // 复制到以旅行册标题命名的路径，方便用户识别
  const outputName = `${sanitizeFilename(title) || "旅行手账"}.pdf`;
  const outputUri = `${FileSystem.cacheDirectory}${outputName}`;
  await FileSystem.copyAsync({ from: uri, to: outputUri });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(outputUri, {
      mimeType: "application/pdf",
      dialogTitle: `分享「${title}」PDF`,
    });
  } else {
    Alert.alert("PDF 已生成", `文件路径：${outputUri}`);
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
      .filter((el): el is CanvasImageElement => el.type === "image" && Boolean(el.uri))
      .map((el) => {
        return `<img class="element-img" src="${escapeHtml(el.uri)}" style="left:${(el.x * 100).toFixed(1)}%;top:${(el.y * 100).toFixed(1)}%;width:${(el.width * 100).toFixed(1)}%;height:${(el.height * 100).toFixed(1)}%;" />`;
      })
      .join("\n");

    const texts = layout.elements
      .filter((el): el is CanvasTextElement => el.type === "text" && Boolean(el.text))
      .map((el) => {
        const fontSize = el.fontSize ?? 16;
        return `<div class="element-text" style="left:${(el.x * 100).toFixed(1)}%;top:${(el.y * 100).toFixed(1)}%;width:${(el.width * 100).toFixed(1)}%;font-size:${fontSize}px;color:${escapeHtml(el.color ?? "#1C2C28")};">${escapeHtml(el.text)}</div>`;
      })
      .join("\n");

    const bgImgTag = bgImage
      ? `<img class="bg-image" src="${escapeHtml(bgImage)}" />`
      : "";

    return `<div class="sheet page-fallback" style="background-color:${escapeHtml(bgColor)};">
      ${bgImgTag}
      ${images}
      ${texts}
    </div>`;
  }

  // ---- 无 layout 的纯文字页（如示例记忆） ----
  if (isCover) {
    return `<div class="sheet page-fallback" style="background-color:${page.coverColor ?? "#EFE2CF"};">
      <div class="cover-body">
        <div class="cover-headline">${escapeHtml(page.headline)}</div>
        <div class="cover-meta">${escapeHtml(page.body)}</div>
      </div>
    </div>`;
  }

  return `<div class="sheet page-fallback" style="background-color: #F7F2EA;">
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
