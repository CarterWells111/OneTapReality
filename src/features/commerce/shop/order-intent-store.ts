/**
 * 订购意向记录：只保存在本机 kv-store，
 * 用于收集样式偏好，不构成真实订单。
 */

import Storage from "expo-sqlite/kv-store";

import { priceFeelLabels, type PriceFeel } from "./shop-options";

export type OrderIntent = {
  id: string;
  skuId: string;
  skuName: string;
  styleId: string;
  styleName: string;
  /** 空字符串表示未刻字或该商品不支持刻字。 */
  engraving: string;
  quantity: number;
  unitPriceCny: number;
  totalPriceCny: number;
  /** 价格反馈为选填；null 表示未填写。 */
  priceFeel: PriceFeel | null;
  /** 空字符串表示未填写。 */
  intendedPriceRange: string;
  note: string;
  /** 该 SKU 的制作周期（天），用于推导演示物流状态；旧记录可能缺失。 */
  leadTimeDays?: number;
  createdAt: string;
};

const orderIntentsKey = "luyi.shop.order-intents.v1";

export async function listOrderIntents(): Promise<OrderIntent[]> {
  try {
    const stored = await Storage.getItemAsync(orderIntentsKey);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as OrderIntent[]) : [];
  } catch {
    return [];
  }
}

export async function saveOrderIntent(intent: OrderIntent): Promise<void> {
  const existing = await listOrderIntents();
  await Storage.setItemAsync(orderIntentsKey, JSON.stringify([intent, ...existing]));
}

export async function clearOrderIntents(): Promise<void> {
  await Storage.setItemAsync(orderIntentsKey, JSON.stringify([]));
}

export function createOrderIntentId(): string {
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatIntentTime(createdAt: string): string {
  return `${createdAt.slice(0, 10)} ${createdAt.slice(11, 16)}`;
}

export function exportOrderIntents(intents: OrderIntent[]): string {
  const lines = intents.map((intent, index) => {
    const priceFeel = intent.priceFeel ? priceFeelLabels[intent.priceFeel] : "未填写";
    const intendedRange = intent.intendedPriceRange || "未填写";
    const engraving = intent.engraving ? `；刻字：「${intent.engraving}」` : "";
    const note = intent.note ? `；备注：${intent.note}` : "";
    return `${index + 1}. ${intent.skuName}（${intent.styleName}）× ${intent.quantity}，¥${intent.totalPriceCny}；价格感受：${priceFeel}；愿付价位：${intendedRange}${engraving}${note}（${formatIntentTime(intent.createdAt)}）`;
  });
  return [
    "一触如初 · 纪念品订购意向",
    ...lines,
  ].join("\n");
}
