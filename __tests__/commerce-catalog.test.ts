import type { CatalogSku } from "../src/features/commerce/catalog/catalog";
import {
  demoCatalog,
  listSkusForCity,
  validateCatalog,
  validateSku,
} from "../src/features/commerce/catalog/catalog";
import {
  computeDemoQuote,
  demoQuoteDisclaimer,
} from "../src/features/commerce/catalog/pricing";

describe("demoCatalog", () => {
  it("passes validation", () => {
    expect(validateCatalog(demoCatalog)).toEqual([]);
  });

  it("has a city-limited sku for every launch city", () => {
    const limitedCities = demoCatalog
      .map((sku) => sku.cityLimited)
      .filter((city) => city !== null);

    expect(new Set(limitedCities)).toEqual(new Set(["hangzhou", "shanghai", "shenzhen"]));
  });

  it("keeps every material and craft traceable", () => {
    for (const sku of demoCatalog) {
      for (const material of sku.materials) {
        expect(material.source).toBeTruthy();
      }
      expect(sku.craft.workshop).toBeTruthy();
    }
  });
});

describe("listSkusForCity", () => {
  it("returns the city-limited sku plus city-agnostic skus", () => {
    const skus = listSkusForCity(demoCatalog, "hangzhou");

    expect(skus.map((sku) => sku.id)).toEqual(["sku-key-hangzhou", "sku-album-square"]);
  });
});

describe("validateSku", () => {
  const base = demoCatalog[0];

  it("rejects a material without a source", () => {
    const broken: CatalogSku = {
      ...base,
      materials: [{ name: "神秘材料", source: "", costCny: 1 }],
    };

    expect(validateSku(broken).join("\n")).toContain("无法追溯");
  });

  it("rejects negative costs", () => {
    const broken: CatalogSku = { ...base, packagingCostCny: -1 };

    expect(validateSku(broken).join("\n")).toContain("不能为负");
  });

  it("rejects an empty material list", () => {
    const broken: CatalogSku = { ...base, materials: [] };

    expect(validateSku(broken).join("\n")).toContain("缺少材料记录");
  });
});

describe("computeDemoQuote", () => {
  const sku = demoCatalog[0];

  it("derives the amount from cost fields plus margin", () => {
    const quote = computeDemoQuote(sku);
    const { materialsCny, craftCny, packagingCny, marginCny } = quote.breakdown;

    expect(materialsCny).toBeCloseTo(9.7);
    expect(craftCny).toBe(8);
    expect(packagingCny).toBe(2.5);
    expect(quote.amount).toBeCloseTo(materialsCny + craftCny + packagingCny + marginCny);
  });

  it("is always flagged as a demo quote with a disclaimer", () => {
    for (const item of demoCatalog) {
      const quote = computeDemoQuote(item);

      expect(quote.kind).toBe("demo");
      expect(quote.disclaimer).toBe(demoQuoteDisclaimer);
      expect(quote.disclaimer).toContain("不是真实成交价");
    }
  });

  it("supports a custom margin rate", () => {
    const zeroMargin = computeDemoQuote(sku, 0);

    expect(zeroMargin.breakdown.marginCny).toBe(0);
    expect(zeroMargin.amount).toBeCloseTo(20.2);
  });
});
