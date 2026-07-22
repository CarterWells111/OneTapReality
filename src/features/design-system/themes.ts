import type { LayoutPresetId, LayoutTokens, ThemeId, ThemeTokens } from "./tokens";

export const themes: Record<ThemeId, ThemeTokens> = {
  classic: {
    id: "classic",
    name: "经典米白",
    colors: {
      background: "#F7F3EE",
      surface: "#FFFFFF",
      ink: "#24312B",
      muted: "#69756E",
      accent: "#2F6F5E",
    },
    typography: {
      headlineFont: "georgia",
      bodyFont: "system",
      headlineSize: 22,
      bodySize: 15,
      lineHeight: 1.5,
    },
  },
  sunset: {
    id: "sunset",
    name: "落日暖橙",
    colors: {
      background: "#FBF1E8",
      surface: "#FFF9F4",
      ink: "#3B2A22",
      muted: "#8A6F60",
      accent: "#C96F3B",
    },
    typography: {
      headlineFont: "avenir",
      bodyFont: "system",
      headlineSize: 23,
      bodySize: 15,
      lineHeight: 1.55,
    },
  },
  forest: {
    id: "forest",
    name: "林间墨绿",
    colors: {
      background: "#EEF3EE",
      surface: "#F9FCF9",
      ink: "#1E2B24",
      muted: "#5E6F66",
      accent: "#3E7255",
    },
    typography: {
      headlineFont: "system",
      bodyFont: "system",
      headlineSize: 21,
      bodySize: 14,
      lineHeight: 1.45,
    },
  },
};

export const layoutPresets: Record<LayoutPresetId, LayoutTokens> = {
  "full-bleed": {
    id: "full-bleed",
    name: "满版照片",
    pagePadding: 0,
    photoAreaRatio: 0.78,
    gap: 0.03,
    textAlign: "center",
  },
  framed: {
    id: "framed",
    name: "留白相框",
    pagePadding: 0.08,
    photoAreaRatio: 0.6,
    gap: 0.04,
    textAlign: "center",
  },
  journal: {
    id: "journal",
    name: "手账拼贴",
    pagePadding: 0.06,
    photoAreaRatio: 0.5,
    gap: 0.05,
    textAlign: "left",
  },
};

export const defaultThemeId: ThemeId = "classic";
export const defaultLayoutPresetId: LayoutPresetId = "framed";
