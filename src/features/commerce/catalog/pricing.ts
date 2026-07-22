import type { CatalogSku } from "./catalog";

export const demoQuoteDisclaimer =
  "演示报价：根据材料、工艺与包装成本按固定系数推算，仅用于现场展示，不是真实成交价。";

export type DemoQuote = {
  skuId: string;
  /** 恒为 demo，界面必须据此展示免责声明。 */
  kind: "demo";
  currency: "CNY";
  amount: number;
  breakdown: {
    materialsCny: number;
    craftCny: number;
    packagingCny: number;
    marginCny: number;
  };
  disclaimer: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 纯函数：从成本字段推算 demo 报价。
 * marginRate 为演示毛利系数，默认 0.35。
 */
export function computeDemoQuote(sku: CatalogSku, marginRate = 0.35): DemoQuote {
  const materialsCny = round2(
    sku.materials.reduce((sum, material) => sum + material.costCny, 0)
  );
  const craftCny = round2(sku.craft.costCny);
  const packagingCny = round2(sku.packagingCostCny);
  const baseCost = materialsCny + craftCny + packagingCny;
  const marginCny = round2(baseCost * marginRate);

  return {
    skuId: sku.id,
    kind: "demo",
    currency: "CNY",
    amount: round2(baseCost + marginCny),
    breakdown: { materialsCny, craftCny, packagingCny, marginCny },
    disclaimer: demoQuoteDisclaimer,
  };
}
