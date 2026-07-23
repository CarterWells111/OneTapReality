import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { demoCatalog, type CatalogSku, type SkuKind } from "../../features/commerce/catalog/catalog";
import { computeDemoQuote } from "../../features/commerce/catalog/pricing";
import { listFavoriteSkuIds, toggleFavorite } from "../../features/commerce/shop/favorites-store";
import { formatCny } from "../../features/commerce/shop/shop-options";

const kindGlyphs: Record<SkuKind, string> = {
  "city-key": "钥",
  "album-print": "册",
  "sticker-pack": "贴",
};

export default function ShopFavoritesScreen() {
  const router = useRouter();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void listFavoriteSkuIds().then((ids) => {
        if (isActive) {
          setFavoriteIds(ids);
          setIsReady(true);
        }
      });
      return () => {
        isActive = false;
      };
    }, [])
  );

  const favoriteSkus = favoriteIds
    .map((id) => demoCatalog.find((sku) => sku.id === id))
    .filter((sku): sku is CatalogSku => sku !== undefined);

  const removeFavorite = async (skuId: string) => {
    setFavoriteIds(await toggleFavorite(skuId));
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text selectable style={styles.title}>
          我的收藏{isReady ? ` · ${favoriteSkus.length} 件` : ""}
        </Text>
        <Text selectable style={styles.subtitle}>收藏只保存在这台设备上。</Text>
      </View>

      {!isReady ? (
        <Text selectable style={styles.subtitle}>正在读取本机记录…</Text>
      ) : favoriteSkus.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text selectable style={styles.emptyTitle}>还没有收藏的纪念品</Text>
          <Text selectable style={styles.subtitle}>
            在商店里点亮卡片右上角的星星，把喜欢的先收进来。
          </Text>
          <AppButton label="去商店逛逛" onPress={() => router.push("/shop")} />
        </View>
      ) : (
        <Section title="已收藏的纪念品">
          <View style={styles.list}>
            {favoriteSkus.map((sku) => {
              const quote = computeDemoQuote(sku);
              const city = sku.cityLimited ? cityContent[sku.cityLimited] : null;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={sku.id}
                  onPress={() => router.push({ pathname: "/shop/[skuId]", params: { skuId: sku.id } })}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                >
                  <View style={[styles.swatch, { backgroundColor: city ? city.color : colors.accentSoft }]}>
                    <Text selectable style={styles.swatchText}>
                      {city ? city.name.slice(0, 1) : kindGlyphs[sku.kind]}
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text numberOfLines={1} selectable style={styles.cardTitle}>{sku.name}</Text>
                    <Text numberOfLines={1} selectable style={styles.cardMeta}>
                      {city ? `${city.name}限定` : "通用款"} · {formatCny(quote.amount)} 起
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`取消收藏${sku.name}`}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => void removeFavorite(sku.id)}
                    style={({ pressed }) => [styles.starButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.star}>★</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        </Section>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20, paddingBottom: 40 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 20, gap: 8, padding: 18 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  list: { gap: 12 },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  swatch: { alignItems: "center", borderRadius: 14, height: 56, justifyContent: "center", width: 56 },
  swatchText: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: colors.ink, fontSize: 15.5, fontWeight: "700" },
  cardMeta: { color: colors.muted, fontSize: 12.5 },
  starButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  star: { color: "#F5B301", fontSize: 22 },
  pressed: { opacity: 0.85 },
});
