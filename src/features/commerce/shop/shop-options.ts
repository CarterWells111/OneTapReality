/**
 * 纪念品商店的展示配置：分区、订购样式、刻字规则与价格意向选项。
 * 纯配置 + 纯函数，不含任何支付逻辑。
 */

import type { CatalogSku, SkuKind } from "../catalog/catalog";
import { computeDemoQuote } from "../catalog/pricing";

export type ShopTier = "basic" | "special";

/** 使用 SKU 自身的 tier 字段，不再根据城市限定推断。 */
export function getSkuTier(sku: CatalogSku): ShopTier {
  return sku.tier;
}

export const tierLabels: Record<ShopTier, string> = {
  basic: "基础款",
  special: "特殊款",
};

export type StyleOption = {
  id: string;
  name: string;
  note: string;
  /** 相对基础演示价的加价（元）。 */
  deltaCny: number;
};

export const styleOptionsByKind: Record<SkuKind, StyleOption[]> = {
  "city-key": [
    { id: "polished", name: "亮面抛光", note: "经典金属光泽", deltaCny: 0 },
    { id: "matte", name: "哑光做旧", note: "复古手感，越用越温润", deltaCny: 3 },
    { id: "enamel", name: "珐琅点彩", note: "局部上色，更亮眼", deltaCny: 6 },
  ],
  "album-print": [
    { id: "linen", name: "亚麻布面", note: "素雅耐翻", deltaCny: 0 },
    { id: "leather", name: "细纹皮面", note: "更扎实的收藏感", deltaCny: 12 },
    { id: "slipcase", name: "布面 + 函套", note: "适合送礼", deltaCny: 20 },
  ],
  "sticker-pack": [
    { id: "classic", name: "经典油墨", note: "标准印刷", deltaCny: 0 },
    { id: "gilded", name: "烫金点缀", note: "局部烫金工艺", deltaCny: 4 },
  ],
  "souvenir-pendant": [
    { id: "standard", name: "标准链绳", note: "皮绳 + 绒布袋", deltaCny: 0 },
    { id: "giftbox", name: "礼盒装", note: "丝绒内衬礼盒 + 缎带", deltaCny: 8 },
  ],
};

/** 该类型支持的刻字位置文案；null 表示不支持刻字。 */
export const engravingFieldByKind: Record<SkuKind, string | null> = {
  "city-key": "背面刻字",
  "album-print": "封面烫字",
  "sticker-pack": null,
  "souvenir-pendant": "背面刻字",
};

export const maxEngravingLength = 12;

export type PriceFeel = "bargain" | "fair" | "pricey";

export const priceFeelOptions: { id: PriceFeel; label: string }[] = [
  { id: "bargain", label: "很划算" },
  { id: "fair", label: "价格合适" },
  { id: "pricey", label: "有点贵" },
];

export const priceFeelLabels: Record<PriceFeel, string> = {
  bargain: "很划算",
  fair: "价格合适",
  pricey: "有点贵",
};

export const intendedPriceRanges = [
  "¥20 以内",
  "¥20–39",
  "¥40–59",
  "¥60–89",
  "¥90 以上",
] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 基础演示价 + 样式加价 = 单件演示价。 */
export function computeStyledUnitPrice(sku: CatalogSku, style: StyleOption): number {
  return round2(computeDemoQuote(sku).amount + style.deltaCny);
}

export function computeStyledTotal(
  sku: CatalogSku,
  style: StyleOption,
  quantity: number
): number {
  return round2(computeStyledUnitPrice(sku, style) * quantity);
}

export function formatCny(amount: number): string {
  return `¥${amount.toFixed(2).replace(/\.00$/, "")}`;
}
