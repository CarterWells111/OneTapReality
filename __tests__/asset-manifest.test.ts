import type { AssetManifest, DesignAsset } from "../src/features/assets/asset-manifest";
import {
  listAssetsByCategory,
  listSellableAssets,
  validateAssetManifest,
} from "../src/features/assets/asset-manifest";
import { designManifest } from "../src/features/assets/design-manifest";

function asset(overrides: Partial<DesignAsset> = {}): DesignAsset {
  return {
    id: "sticker-demo",
    category: "sticker",
    name: "演示贴纸",
    preview: "assets/design/previews/sticker-demo.png",
    source: { origin: "first-party", author: "旅忆团队" },
    license: { type: "proprietary", commercialUseConfirmed: true },
    sellable: false,
    ...overrides,
  };
}

describe("designManifest (内置清单)", () => {
  it("passes validation", () => {
    expect(validateAssetManifest(designManifest)).toEqual({ ok: true, errors: [] });
  });

  it("gives every asset an id, category, preview, source, and license", () => {
    for (const item of designManifest.assets) {
      expect(item.id).toBeTruthy();
      expect(item.category).toBeTruthy();
      expect(item.preview).toBeTruthy();
      expect(item.source.origin).toBeTruthy();
      expect(item.license.type).toBeTruthy();
    }
  });
});

describe("validateAssetManifest", () => {
  it("rejects duplicate ids", () => {
    const manifest: AssetManifest = { version: 1, assets: [asset(), asset()] };

    const result = validateAssetManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("资源 ID 重复");
  });

  it("rejects sellable assets without confirmed commercial license", () => {
    const manifest: AssetManifest = {
      version: 1,
      assets: [
        asset({
          id: "sticker-unlicensed",
          sellable: true,
          license: { type: "proprietary", commercialUseConfirmed: false },
        }),
      ],
    };

    const result = validateAssetManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("不能标为可售");
  });

  it("rejects remote preview urls", () => {
    const manifest: AssetManifest = {
      version: 1,
      assets: [asset({ preview: "https://example.com/sticker.png" })],
    };

    expect(validateAssetManifest(manifest).ok).toBe(false);
  });

  it("rejects unlicensed third-party material entirely", () => {
    const manifest: AssetManifest = {
      version: 1,
      assets: [
        asset({
          id: "sticker-borrowed",
          source: { origin: "third-party" },
          license: { type: "unknown", commercialUseConfirmed: false },
        }),
      ],
    };

    const result = validateAssetManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("不允许收录");
  });
});

describe("selectors", () => {
  it("only lists sellable assets with confirmed licenses", () => {
    const sellable = listSellableAssets(designManifest);

    expect(sellable.length).toBeGreaterThan(0);
    for (const item of sellable) {
      expect(item.license.commercialUseConfirmed).toBe(true);
    }
  });

  it("filters by category", () => {
    const fonts = listAssetsByCategory(designManifest, "font");

    expect(fonts.every((item) => item.category === "font")).toBe(true);
  });
});
