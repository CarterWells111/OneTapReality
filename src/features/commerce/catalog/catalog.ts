/**
 * 现场展示与供应商对接用的商品目录模型。
 * 不接支付、购物车、地址或订单；报价仅为 demo 展示。
 */

import { cities, type City } from "../../../types/memory";

export const skuKinds = ["city-key", "album-print", "sticker-pack", "souvenir-pendant"] as const;

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
  /** 商品预览图本地路径；空字符串表示无图片（使用纯色占位）。 */
  image: string;
  /** 商品层级：普通版或特殊版。 */
  tier: "basic" | "special";
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

/** 城市市花纪念挂坠：每城普通版 + 特殊版。 */
const souvenirCities = [
  { city: "beijing" as City, nameCity: "北京", namePoetic: "京·玉兰坠", flower: "玉兰", craft: "景泰蓝掐丝珐琅", image: "beijing-yulan" },
  { city: "fuzhou" as City, nameCity: "福州", namePoetic: "榕·茉莉坠", flower: "茉莉花", craft: "脱胎漆器", image: "fuzhou-moli" },
  { city: "hangzhou" as City, nameCity: "杭州", namePoetic: "杭·荷风坠", flower: "荷花", craft: "木版水印", image: "hangzhou-hehua" },
  { city: "kunming" as City, nameCity: "昆明", namePoetic: "昆·山茶坠", flower: "山茶花", craft: "珐琅工艺", image: "kunming-shancha" },
  { city: "luoyang" as City, nameCity: "洛阳", namePoetic: "洛·天香坠", flower: "牡丹", craft: "唐三彩", image: "luoyang-mudan" },
  { city: "nanjing" as City, nameCity: "南京", namePoetic: "宁·梅影坠", flower: "梅花", craft: "云锦", image: "nanjing-meihua" },
  { city: "shanghai" as City, nameCity: "上海", namePoetic: "沪·白玉坠", flower: "白玉兰", craft: "顾绣", image: "shanghai-baiyulan" },
  { city: "suzhou" as City, nameCity: "苏州", namePoetic: "苏·紫藤坠", flower: "紫藤", craft: "苏绣", image: "suzhou-ziteng" },
  { city: "tianjin" as City, nameCity: "天津", namePoetic: "津·月季坠", flower: "月季", craft: "杨柳青年画", image: "tianjin-yueji" },
  { city: "wuhan" as City, nameCity: "武汉", namePoetic: "汉·荷语坠", flower: "荷花", craft: "汉绣", image: "wuhan-hehua" },
];

function souvenirBasic(d: (typeof souvenirCities)[number]): CatalogSku {
  return {
    id: `sku-pendant-${d.city}-basic`,
    name: d.namePoetic,
    kind: "souvenir-pendant",
    cityLimited: d.city,
    materials: [
      { name: "黄铜八角坯", source: "演示供应商 A（杭州）", costCny: 14.98 },
      { name: "珐琅底色", source: "演示供应商 B（东莞）", costCny: 8.63 },
    ],
    craft: {
      process: `八棱吊坠·${d.flower}·普通版`,
      workshop: `演示工坊（${d.nameCity}）`,
      leadTimeDays: 14,
      costCny: 7.5,
    },
    packagingCostCny: 0,
    image: "",
    tier: "basic",
  };
}

function souvenirSpecial(d: (typeof souvenirCities)[number]): CatalogSku {
  return {
    id: `sku-pendant-${d.city}-special`,
    name: `${d.namePoetic}·${d.craft}`,
    kind: "souvenir-pendant",
    cityLimited: d.city,
    materials: [
      { name: "黄铜八角坯", source: "演示供应商 A（杭州）", costCny: 14.98 },
      { name: `${d.craft}彩绘`, source: `演示供应商（${d.nameCity}）`, costCny: 14.76 },
    ],
    craft: {
      process: `八棱吊坠·${d.flower}·${d.craft}`,
      workshop: `演示工坊（${d.nameCity}）`,
      leadTimeDays: 21,
      costCny: 8.78,
    },
    packagingCostCny: 0,
    image: `souvenirs/${d.image}.png`,
    tier: "special",
  };
}

const souvenirSkus: CatalogSku[] = souvenirCities.flatMap((d) => [
  souvenirBasic(d),
  souvenirSpecial(d),
]);

export const demoCatalog: CatalogSku[] = [
  ...souvenirSkus,
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
    image: "",
    tier: "special",
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
    image: "",
    tier: "special",
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
    image: "",
    tier: "special",
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
    image: "",
    tier: "basic",
  },
  {
    id: "sku-sticker-journey",
    name: "旅程贴纸手账包",
    kind: "sticker-pack",
    cityLimited: null,
    materials: [
      { name: "和纸贴纸", source: "演示纸厂 E（广州）", costCny: 4.5 },
      { name: "烫金箔", source: "演示供应商 B（东莞）", costCny: 1.8 },
    ],
    craft: {
      process: "模切 + 局部烫金",
      workshop: "演示印厂（广州）",
      leadTimeDays: 5,
      costCny: 3.5,
    },
    packagingCostCny: 1.5,
    image: "",
    tier: "basic",
  },
];
