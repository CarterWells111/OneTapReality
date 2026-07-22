import type { CanvasFontStyle } from "../../types/memory";

export const themeIds = ["classic", "sunset", "forest"] as const;

export type ThemeId = (typeof themeIds)[number];

export type ThemeTokens = {
  id: ThemeId;
  name: string;
  colors: {
    background: string;
    surface: string;
    ink: string;
    muted: string;
    accent: string;
  };
  typography: {
    headlineFont: CanvasFontStyle;
    bodyFont: CanvasFontStyle;
    headlineSize: number;
    bodySize: number;
    lineHeight: number;
  };
};

export const layoutPresetIds = ["full-bleed", "framed", "journal"] as const;

export type LayoutPresetId = (typeof layoutPresetIds)[number];

export type LayoutTokens = {
  id: LayoutPresetId;
  name: string;
  /** 页面内边距，相对页宽 0..1。 */
  pagePadding: number;
  /** 照片区域占页面高度的比例 0..1。 */
  photoAreaRatio: number;
  /** 元素之间的间距，相对页宽 0..1。 */
  gap: number;
  textAlign: "left" | "center";
};
