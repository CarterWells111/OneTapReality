import {
  defaultLayoutPresetId,
  defaultThemeId,
  layoutPresets,
  themes,
} from "./themes";
import type {
  LayoutPresetId,
  LayoutTokens,
  ThemeId,
  ThemeTokens,
} from "./tokens";
import { layoutPresetIds, themeIds } from "./tokens";

export function isThemeId(value: string): value is ThemeId {
  return (themeIds as readonly string[]).includes(value);
}

export function isLayoutPresetId(value: string): value is LayoutPresetId {
  return (layoutPresetIds as readonly string[]).includes(value);
}

/**
 * 纯函数：按 id 解析主题 token。未知 id 回退到默认主题，保证总有可用值。
 */
export function resolveTheme(themeId: string | undefined): ThemeTokens {
  if (themeId !== undefined && isThemeId(themeId)) {
    return themes[themeId];
  }
  return themes[defaultThemeId];
}

/**
 * 纯函数：按 id 解析版式 token。未知 id 回退到默认版式。
 */
export function resolveLayoutPreset(presetId: string | undefined): LayoutTokens {
  if (presetId !== undefined && isLayoutPresetId(presetId)) {
    return layoutPresets[presetId];
  }
  return layoutPresets[defaultLayoutPresetId];
}

/**
 * 纯函数：一次解析主题与版式的组合，供页面渲染直接消费。
 */
export function resolvePageStyle(input: {
  themeId?: string;
  layoutPresetId?: string;
}): { theme: ThemeTokens; layout: LayoutTokens } {
  return {
    theme: resolveTheme(input.themeId),
    layout: resolveLayoutPreset(input.layoutPresetId),
  };
}
