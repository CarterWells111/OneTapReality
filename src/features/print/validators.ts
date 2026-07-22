import type { StoryPage } from "../../types/memory";
import type { PrintSpec } from "./print-spec";
import { safeAreaOf } from "./print-spec";

/** 相对坐标盒（0..1），与画布元素同一坐标系。 */
export type RelativeBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PrintIssue =
  | { type: "page-count-too-low"; actual: number; min: number }
  | { type: "page-count-too-high"; actual: number; max: number }
  | { type: "missing-photo"; pageId: string }
  | { type: "out-of-safe-area"; pageId: string; elementId: string };

/**
 * 纯函数：判断一个相对坐标盒是否完全落在安全区内（边界视为安全）。
 */
export function isWithinSafeArea(box: RelativeBox, spec: PrintSpec): boolean {
  const safe = safeAreaOf(spec);
  return (
    box.x >= safe.x &&
    box.y >= safe.y &&
    box.x + box.width <= safe.x + safe.width &&
    box.y + box.height <= safe.y + safe.height
  );
}

/**
 * 纯函数：校验页数是否在规格允许的范围内。
 */
export function validatePageCount(count: number, spec: PrintSpec): PrintIssue[] {
  if (count < spec.minPages) {
    return [{ type: "page-count-too-low", actual: count, min: spec.minPages }];
  }
  if (count > spec.maxPages) {
    return [{ type: "page-count-too-high", actual: count, max: spec.maxPages }];
  }
  return [];
}

/**
 * 纯函数：校验图片占位——photo 页必须已有照片。
 */
export function validatePhotoPlaceholders(pages: readonly StoryPage[]): PrintIssue[] {
  return pages
    .filter((page) => page.kind === "photo" && !page.photoUri)
    .map((page) => ({ type: "missing-photo" as const, pageId: page.id }));
}

/**
 * 纯函数：校验每页画布元素是否越出安全区。
 * 没有布局信息的页面（旧数据）跳过安全区检查。
 */
export function validateSafeAreas(
  pages: readonly StoryPage[],
  spec: PrintSpec
): PrintIssue[] {
  const issues: PrintIssue[] = [];
  for (const page of pages) {
    if (!page.layout) {
      continue;
    }
    for (const element of page.layout.elements) {
      const box: RelativeBox = {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      };
      if (!isWithinSafeArea(box, spec)) {
        issues.push({
          type: "out-of-safe-area",
          pageId: page.id,
          elementId: element.id,
        });
      }
    }
  }
  return issues;
}

/**
 * 纯函数：整册打印前校验，汇总页数、图片占位与安全区问题。
 */
export function validateAlbumForPrint(
  pages: readonly StoryPage[],
  spec: PrintSpec
): { ok: boolean; issues: PrintIssue[] } {
  const issues = [
    ...validatePageCount(pages.length, spec),
    ...validatePhotoPlaceholders(pages),
    ...validateSafeAreas(pages, spec),
  ];
  return { ok: issues.length === 0, issues };
}
