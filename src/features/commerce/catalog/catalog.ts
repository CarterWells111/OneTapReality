/**
 * 现场展示与供应商对接用的商品目录模型。
 * 不接支付、购物车、地址或订单；报价仅为 demo 展示。
 */

import { cities, type City } from "../../../types/memory";

export const skuKinds = ["city-key", "album-print", "sticker-pack"] as const;

export type SkuKind = (typeof skuKinds)[number];

export type SkuMaterial = {
  name: string;
  /** 材料来源（供应商/产地），用于追溯。 */
  source: string;
  costCny: number;
};

export type SkuCraft = {
  /** 工艺说明。 */
  process: string;
  /** 加工方，用于追溯。 */
  workshop: string;
  leadTimeDays: number;
  costCny: number;
};

export type CatalogSku = {
  id: string;
  name: string;
  kind: SkuKind;
  /** 城市限定 SKU：仅在该城市发售；null 表示不限城市。 */
  cityLimited: City | null;
  materials: SkuMaterial[];
  craft: SkuCraft;
  packagingCostCny: number;
};

export function validateSku(sku: CatalogSku): string[] {
  const errors: string[] = [];
  if (!sku.id) {
    errors.push("SKU 缺少 id");
  }
  if (!sku.name) {
    errors.push(`SKU ${sku.id || "(未知)"} 缺少名称`);
  }
  if (!(skuKinds as readonly string[]).includes(sku.kind)) {
    errors.push(`SKU ${sku.id} 的类型无效`);
  }
  if (sku.cityLimited !== null && !(cities as readonly string[]).includes(sku.cityLimited)) {
    errors.push(`SKU ${sku.id} 的限定城市无效`);
  }
  if (sku.materials.length === 0) {
    errors.push(`SKU ${sku.id} 缺少材料记录`);
  }
  for (const material of sku.materials) {
    if (!material.source) {
      errors.push(`SKU ${sku.id} 的材料「${material.name}」缺少来源，无法追溯`);
    }
    if (material.costCny < 0) {
      errors.push(`SKU ${sku.id} 的材料「${material.name}」成本不能为负`);
    }
  }
  if (!sku.craft.workshop) {
    errors.push(`SKU ${sku.id} 缺少加工方，无法追溯`);
  }
  if (sku.craft.costCny < 0 || sku.packagingCostCny < 0) {
    errors.push(`SKU ${sku.id} 的成本字段不能为负`);
  }
  return errors;
}

export function validateCatalog(catalog: readonly CatalogSku[]): string[] {
  const errors = catalog.flatMap(validateSku);
  const ids = catalog.map((sku) => sku.id);
  for (const id of ids) {
    if (ids.indexOf(id) !== ids.lastIndexOf(id) && !errors.includes(`SKU ID 重复：${id}`)) {
      errors.push(`SKU ID 重复：${id}`);
    }
  }
  return errors;
}

/** 按城市筛选：返回该城市限定 SKU 与不限城市 SKU。 */
export function listSkusForCity(
  catalog: readonly CatalogSku[],
  city: City
): CatalogSku[] {
  return catalog.filter((sku) => sku.cityLimited === null || sku.cityLimited === city);
}

/** 演示目录：三座首发城市的城市限定钥匙 + 通用打印册。 */
export const demoCatalog: CatalogSku[] = [
  {
    id: "sku-key-hangzhou",
    name: "西湖莲影纪念钥匙",
    kind: "city-key",
    cityLimited: "hangzhou",
    materials: [
      { name: "黄铜坯", source: "演示供应商 A（杭州）", costCny: 6.5 },
      { name: "珐琅彩", source: "演示供应商 B（东莞）", costCny: 3.2 },
    ],
    craft: {
      process: "冲压 + 珐琅上色",
      workshop: "演示工坊（杭州）",
      leadTimeDays: 14,
      costCny: 8,
    },
    packagingCostCny: 2.5,
  },
  {
    id: "sku-key-shanghai",
    name: "外滩天际线纪念钥匙",
    kind: "city-key",
    cityLimited: "shanghai",
    materials: [
      { name: "黄铜坯", source: "演示供应商 A（杭州）", costCny: 6.5 },
      { name: "镀镍层", source: "演示供应商 C（苏州）", costCny: 2.8 },
    ],
    craft: {
      process: "冲压 + 镀镍",
      workshop: "演示工坊（上海）",
      leadTimeDays: 12,
      costCny: 7.5,
    },
    packagingCostCny: 2.5,
  },
  {
    id: "sku-key-shenzhen",
    name: "海湾科技线纪念钥匙",
    kind: "city-key",
    cityLimited: "shenzhen",
    materials: [
      { name: "铝合金坯", source: "演示供应商 D（深圳）", costCny: 5.9 },
      { name: "阳极氧化", source: "演示供应商 D（深圳）", costCny: 2.2 },
    ],
    craft: {
      process: "CNC + 阳极氧化",
      workshop: "演示工坊（深圳）",
      leadTimeDays: 10,
      costCny: 9,
    },
    packagingCostCny: 2.5,
  },
  {
    id: "sku-album-square",
    name: "方形旅行册（打印版）",
    kind: "album-print",
    cityLimited: null,
    materials: [
      { name: "哑光相纸", source: "演示纸厂 E（广州）", costCny: 12 },
      { name: "亚麻封面布", source: "演示布厂 F（南通）", costCny: 9 },
    ],
    craft: {
      process: "数码打印 + 锁线装订",
      workshop: "演示印厂（广州）",
      leadTimeDays: 7,
      costCny: 18,
    },
    packagingCostCny: 4,
  },
];
