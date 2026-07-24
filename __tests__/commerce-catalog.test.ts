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

  it("has souvenir pendants for 10 cities", () => {
    const pendantCities = demoCatalog
      .filter((sku) => sku.kind === "souvenir-pendant")
      .map((sku) => sku.cityLimited)
      .filter((city) => city !== null);

    const unique = new Set(pendantCities);
    expect(unique.size).toBe(10);
    expect(unique).toContain("beijing");
    expect(unique).toContain("wuhan");
  });

  it("keeps every material and craft traceable", () => {
    for (const sku of demoCatalog) {
      for (const material of sku.materials) {
        expect(material.source).toBeTruthy();
      }
      expect(sku.craft.workshop).toBeTruthy();
    }
  });

  it("every SKU has image and tier fields", () => {
    for (const sku of demoCatalog) {
      expect(sku).toHaveProperty("image");
      expect(sku).toHaveProperty("tier");
      expect(["basic", "special"]).toContain(sku.tier);
    }
  });
});

describe("listSkusForCity", () => {
  it("returns city-limited and city-agnostic skus for hangzhou", () => {
    const skus = listSkusForCity(demoCatalog, "hangzhou");

    expect(skus.some((sku) => sku.id === "sku-key-hangzhou")).toBe(true);
    expect(skus.some((sku) => sku.id === "sku-album-square")).toBe(true);
    expect(skus.some((sku) => sku.id === "sku-sticker-journey")).toBe(true);
    expect(skus.some((sku) => sku.id === "sku-pendant-hangzhou-basic")).toBe(true);
    expect(skus.some((sku) => sku.id === "sku-pendant-hangzhou-special")).toBe(true);
  });

  it("does not return other city limited skus", () => {
    const skus = listSkusForCity(demoCatalog, "hangzhou");

    expect(skus.some((sku) => sku.id === "sku-key-shanghai")).toBe(false);
    expect(skus.some((sku) => sku.id === "sku-pendant-beijing-basic")).toBe(false);
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

    expect(materialsCny).toBeCloseTo(23.61);
    expect(craftCny).toBe(7.5);
    expect(packagingCny).toBe(0);
    expect(quote.amount).toBeCloseTo(materialsCny + craftCny + packagingCny + marginCny);
  });

  it("is always flagged as a demo quote with a disclaimer", () => {
    for (const item of demoCatalog) {
      const quote = computeDemoQuote(item);

      expect(quote.kind).toBe("demo");
      expect(quote.disclaimer).toBe(demoQuoteDisclaimer);
      expect(quote.disclaimer).toContain("报价根据材料、工艺与包装成本按固定系数推算。");
    }
  });

  it("supports a custom margin rate", () => {
    const zeroMargin = computeDemoQuote(sku, 0);

    expect(zeroMargin.breakdown.marginCny).toBe(0);
    expect(zeroMargin.amount).toBeCloseTo(31.11);
  });

  it("basic pendant is ¥42 and special pendant is ¥52", () => {
    const basic = demoCatalog.find((s) => s.id === "sku-pendant-beijing-basic")!;
    const special = demoCatalog.find((s) => s.id === "sku-pendant-beijing-special")!;

    expect(computeDemoQuote(basic).amount).toBeCloseTo(42);
    expect(computeDemoQuote(special).amount).toBeCloseTo(52);
  });
});
