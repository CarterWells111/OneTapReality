/** 商品收藏的本机持久化：只保存 SKU id 列表到 kv-store，不上传。 */

import Storage from "expo-sqlite/kv-store";

import { toggleFavoriteSku } from "./favorites";

const favoritesKey = "luyi.shop.favorites.v1";

export async function listFavoriteSkuIds(): Promise<string[]> {
  try {
    const stored = await Storage.getItemAsync(favoritesKey);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export async function toggleFavorite(skuId: string): Promise<string[]> {
  const next = toggleFavoriteSku(await listFavoriteSkuIds(), skuId);
  await Storage.setItemAsync(favoritesKey, JSON.stringify(next));
  return next;
}
