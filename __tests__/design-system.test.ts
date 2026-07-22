import {
  isLayoutPresetId,
  isThemeId,
  resolveLayoutPreset,
  resolvePageStyle,
  resolveTheme,
} from "../src/features/design-system/resolve";
import { layoutPresets, themes } from "../src/features/design-system/themes";
import { layoutPresetIds, themeIds } from "../src/features/design-system/tokens";

describe("design system tokens", () => {
  it("defines at least three themes", () => {
    expect(themeIds.length).toBeGreaterThanOrEqual(3);
    for (const id of themeIds) {
      expect(themes[id].id).toBe(id);
      expect(themes[id].colors.background).toMatch(/^#[0-9A-F]{6}$/i);
      expect(themes[id].typography.bodySize).toBeGreaterThan(0);
    }
  });

  it("defines layout presets with relative values inside 0..1", () => {
    for (const id of layoutPresetIds) {
      const preset = layoutPresets[id];
      expect(preset.pagePadding).toBeGreaterThanOrEqual(0);
      expect(preset.pagePadding).toBeLessThan(1);
      expect(preset.photoAreaRatio).toBeGreaterThan(0);
      expect(preset.photoAreaRatio).toBeLessThanOrEqual(1);
    }
  });
});

describe("resolveTheme", () => {
  it("resolves a known theme id", () => {
    expect(resolveTheme("sunset").name).toBe("落日暖橙");
  });

  it("falls back to the default theme for unknown or missing ids", () => {
    expect(resolveTheme("neon-party")).toEqual(themes.classic);
    expect(resolveTheme(undefined)).toEqual(themes.classic);
  });

  it("is pure: same input yields equal output and no mutation", () => {
    const first = resolveTheme("forest");
    const second = resolveTheme("forest");

    expect(first).toEqual(second);
    expect(themes.forest.name).toBe("林间墨绿");
  });
});

describe("resolveLayoutPreset", () => {
  it("resolves a known preset id", () => {
    expect(resolveLayoutPreset("journal").textAlign).toBe("left");
  });

  it("falls back to the default preset for unknown ids", () => {
    expect(resolveLayoutPreset("masonry")).toEqual(layoutPresets.framed);
  });
});

describe("resolvePageStyle", () => {
  it("combines theme and layout in one call", () => {
    const style = resolvePageStyle({ themeId: "sunset", layoutPresetId: "full-bleed" });

    expect(style.theme.id).toBe("sunset");
    expect(style.layout.id).toBe("full-bleed");
  });
});

describe("type guards", () => {
  it("accepts known ids and rejects unknown ones", () => {
    expect(isThemeId("classic")).toBe(true);
    expect(isThemeId("tailwind")).toBe(false);
    expect(isLayoutPresetId("framed")).toBe(true);
    expect(isLayoutPresetId("webview")).toBe(false);
  });
});
