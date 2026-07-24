import { Alert, Platform } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
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
 * iOS 上用 Alert 模拟 Apple 风格操作表；
 * 把导出选项（图片/PDF/.tralbum/存相册）对接到底层的 expo 能力。
 */

const EXPORT_OPTIONS: { label: string; format: ExportFormat; icon?: string }[] = [
  { label: "导出为 PDF", format: "pdf" },
  { label: "导出为 .tralbum 格式", format: "tralbum" },
];

export async function showShareActionSheet(target: ShareTarget) {
  const { pages, title } = target;

  // 构建选项按钮
  const options = [
    ...EXPORT_OPTIONS.map((opt) => opt.label),
    "取消",
  ];

  const cancelIndex = options.length - 1;

  Alert.alert(
    "分享旅行手账",
    `"${title}" 导出为：`,
    [
      ...EXPORT_OPTIONS.map((opt, idx) => ({
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
    Alert.alert("导出失败", err.message ?? "未知错误");
  }
}

/**
 * 将所有页面渲染为图片后合并成 PDF，再调起系统分享。
 */
async function exportPdf(pages: StoryPage[], title: string) {
  // 将页面内容渲染为简单 HTML 图片页（用 layout 信息构造）
  const imagesHtml = pages
    .map((page, i) => {
      // 优先用页面的 photoUri
      const imgSrc = (page as any).photoUri ?? "";
      if (!imgSrc) return "";
      return `<img src="${imgSrc}" style="width:100%;page-break-after:always;" />`;
    })
    .filter(Boolean)
    .join("");

  if (!imagesHtml) {
    Alert.alert("无法导出", "当前旅行册没有可导出的图片页面。");
    return;
  }

  const html = `<!DOCTYPE html><html><head>
    <style>@page { margin: 0; size: A4; } body { margin: 0; } img { display: block; width: 100%; }</style>
  </head><body>${imagesHtml}</body></html>`;

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

/**
 * 导出为 .tralbum JSON 格式，写入临时文件后调起分享。
 */
async function exportTralbum(pages: StoryPage[], title: string) {
  const json = exportAsTralbumFormat(pages, title);
  const fileUri = FileSystem.cacheDirectory + `${sanitizeFilename(title)}.tralbum`;
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

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
 * 暂不支持逐页截图（需要 ViewShot 配合）。
 */
async function exportPng(_pages: StoryPage[], _title: string) {
  Alert.alert("提示", "图片导出需要配合截图组件，当前版本暂不支持逐页 PNG 导出。请使用 PDF 格式。");
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").slice(0, 64) || "tralbum";
}
