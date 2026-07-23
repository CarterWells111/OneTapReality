import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { demoCatalog, type CatalogSku, type SkuKind } from "../../features/commerce/catalog/catalog";
import { computeDemoQuote, demoQuoteDisclaimer } from "../../features/commerce/catalog/pricing";
import { isFavoriteSku } from "../../features/commerce/shop/favorites";
import { listFavoriteSkuIds, toggleFavorite } from "../../features/commerce/shop/favorites-store";
import { formatCny, getSkuTier } from "../../features/commerce/shop/shop-options";

const kindGlyphs: Record<SkuKind, string> = {
  "city-key": "钥",
  "album-print": "册",
  "sticker-pack": "贴",
};

export default function ShopScreen() {
  const router = useRouter();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const specialSkus = demoCatalog.filter((sku) => getSkuTier(sku) === "special");
  const basicSkus = demoCatalog.filter((sku) => getSkuTier(sku) === "basic");

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void listFavoriteSkuIds().then((ids) => {
        if (isActive) setFavoriteIds(ids);
      });
      return () => {
        isActive = false;
      };
    }, [])
  );

  const openSku = (skuId: string) => {
    router.push({ pathname: "/shop/[skuId]", params: { skuId } });
  };

  const onToggleFavorite = async (skuId: string) => {
    setFavoriteIds(await toggleFavorite(skuId));
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text selectable style={styles.eyebrow}>纪念品商店 · 现场演示</Text>
        <Text selectable style={styles.title}>把这段旅程带回家</Text>
        <Text selectable style={styles.subtitle}>
          每一件都可选样式，大多数支持刻字。这里只收集订购意向和价格反馈，不产生真实支付。
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/shop/orders")}
          style={({ pressed }) => [styles.heroLink, pressed && styles.pressed]}
        >
          <Text selectable style={styles.heroLinkText}>查看订单记录 ›</Text>
        </Pressable>
      </View>

      <Section title="特殊款 · 城市限定">
        <View style={styles.grid}>
          {specialSkus.map((sku) => (
            <SkuGridCard
              key={sku.id}
              favorited={isFavoriteSku(favoriteIds, sku.id)}
              sku={sku}
              onPress={() => openSku(sku.id)}
              onToggleFavorite={() => void onToggleFavorite(sku.id)}
            />
          ))}
        </View>
      </Section>

      <Section title="基础款 · 经典通用">
        <View style={styles.grid}>
          {basicSkus.map((sku) => (
            <SkuGridCard
              key={sku.id}
              favorited={isFavoriteSku(favoriteIds, sku.id)}
              sku={sku}
              onPress={() => openSku(sku.id)}
              onToggleFavorite={() => void onToggleFavorite(sku.id)}
            />
          ))}
        </View>
      </Section>

      <Text selectable style={styles.disclaimer}>{demoQuoteDisclaimer}</Text>
    </ScrollView>
  );
}

function SkuGridCard({
  sku,
  favorited,
  onPress,
  onToggleFavorite,
}: {
  sku: CatalogSku;
  favorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const quote = computeDemoQuote(sku);
  const city = sku.cityLimited ? cityContent[sku.cityLimited] : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.swatch, { backgroundColor: city ? city.color : colors.accentSoft }]}>
        <Text selectable style={styles.swatchText}>
          {city ? city.name.slice(0, 1) : kindGlyphs[sku.kind]}
        </Text>
        <Pressable
          accessibilityLabel={favorited ? `取消收藏${sku.name}` : `收藏${sku.name}`}
          accessibilityRole="button"
          accessibilityState={{ selected: favorited }}
          hitSlop={8}
          onPress={onToggleFavorite}
          style={({ pressed }) => [styles.starButton, pressed && styles.pressed]}
        >
          <Text style={[styles.star, favorited && styles.starFavorited]}>
            {favorited ? "★" : "☆"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={2} selectable style={styles.cardTitle}>{sku.name}</Text>
        <Text numberOfLines={1} selectable style={styles.cardMeta}>
          {city ? `${city.name}限定` : "通用款"} · {sku.craft.process}
        </Text>
        <View style={styles.priceRow}>
          <Text selectable style={styles.cardPrice}>{formatCny(quote.amount)}</Text>
          <Text selectable style={styles.cardFrom}>起 · 演示价</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 20, gap: 8, padding: 18 },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  heroLink: { alignSelf: "flex-start", justifyContent: "center", minHeight: 40 },
  heroLinkText: { color: colors.warmAccent, fontSize: 14, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    width: "48.5%",
  },
  swatch: { alignItems: "center", aspectRatio: 1, justifyContent: "center" },
  swatchText: { color: colors.ink, fontSize: 34, fontWeight: "800" },
  starButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.88)",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: 8,
    width: 32,
  },
  star: { color: colors.ink, fontSize: 18, lineHeight: 22 },
  starFavorited: { color: "#F5B301" },
  cardBody: { gap: 4, padding: 10 },
  cardTitle: { color: colors.ink, fontSize: 14.5, fontWeight: "700", minHeight: 38 },
  cardMeta: { color: colors.muted, fontSize: 12 },
  priceRow: { alignItems: "baseline", flexDirection: "row", gap: 4 },
  cardPrice: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cardFrom: { color: colors.muted, fontSize: 11 },
  disclaimer: { color: colors.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
  pressed: { opacity: 0.85 },
});
