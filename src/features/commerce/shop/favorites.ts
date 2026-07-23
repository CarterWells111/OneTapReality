/** 商品收藏的纯逻辑：收藏列表按最近收藏在前排列。 */

export function isFavoriteSku(ids: readonly string[], skuId: string): boolean {
  return ids.includes(skuId);
}

export function toggleFavoriteSku(ids: readonly string[], skuId: string): string[] {
  const deduped = [...new Set(ids)];
  return deduped.includes(skuId)
    ? deduped.filter((id) => id !== skuId)
    : [skuId, ...deduped];
}
