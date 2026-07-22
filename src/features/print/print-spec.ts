export const printFormats = ["square", "a5"] as const;

export type PrintFormat = (typeof printFormats)[number];

export type PrintSpec = {
  format: PrintFormat;
  name: string;
  /** 成品尺寸（毫米）。 */
  pageWidthMm: number;
  pageHeightMm: number;
  /** 出血（毫米），单边。 */
  bleedMm: number;
  /** 安全边距（毫米），单边；文字与关键元素必须在安全区内。 */
  safeMarginMm: number;
  /** 内页页数范围（含封面与封底页）。 */
  minPages: number;
  maxPages: number;
};

export const printSpecs: Record<PrintFormat, PrintSpec> = {
  square: {
    format: "square",
    name: "方形旅行册 210×210",
    pageWidthMm: 210,
    pageHeightMm: 210,
    bleedMm: 3,
    safeMarginMm: 10,
    minPages: 3,
    maxPages: 40,
  },
  a5: {
    format: "a5",
    name: "A5 旅行册 148×210",
    pageWidthMm: 148,
    pageHeightMm: 210,
    bleedMm: 3,
    safeMarginMm: 8,
    minPages: 3,
    maxPages: 60,
  },
};

/**
 * 纯函数：把安全边距换算为页面内的相对安全区（0..1 坐标系）。
 */
export function safeAreaOf(spec: PrintSpec): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const x = spec.safeMarginMm / spec.pageWidthMm;
  const y = spec.safeMarginMm / spec.pageHeightMm;
  return { x, y, width: 1 - 2 * x, height: 1 - 2 * y };
}
