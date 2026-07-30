import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { bodyFont, colors, ScreenTitle, serifFont } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { demoCatalog, type CatalogSku, type SkuKind } from "../../features/commerce/catalog/catalog";
import { computeDemoQuote, demoQuoteDisclaimer } from "../../features/commerce/catalog/pricing";
import { isFavoriteSku } from "../../features/commerce/shop/favorites";
import { listFavoriteSkuIds, toggleFavorite } from "../../features/commerce/shop/favorites-store";
import { formatCny, getSkuTier } from "../../features/commerce/shop/shop-options";
import { getSouvenirImage } from "../../features/assets/souvenir-images";

const kindGlyphs: Record<SkuKind, string> = {
  "city-key": "钥",
  "album-print": "册",
  "sticker-pack": "贴",
  "souvenir-pendant": "花",
};

export default function ShopScreen() {
  const router = useRouter();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [activeTier, setActiveTier] = useState<"special" | "basic">("special");
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.screen}
    >
      <ScreenTitle
        title="商店"
        caption="CITY KEEPSAKES"
        right={
          <Pressable
            accessibilityLabel="打开购物袋"
            accessibilityRole="button"
            onPress={() => router.push("/shop/orders")}
            style={({ pressed }) => [styles.bagButton, pressed && styles.pressed]}
          >
            <Text style={styles.bagIcon}>袋</Text>
          </Pressable>
        }
      />

      <View style={styles.hero}>
        <View style={styles.heroSketch}>
          <Text selectable style={styles.heroSketchText}>把旅程装进口袋</Text>
          <Text selectable style={styles.heroSketchLine}>花签 · 小册 · 城市坠 · 贴纸包</Text>
        </View>
        <Text selectable style={styles.heroCopy}>
          挑一件手作纪念品，选择款式与包装，放入购物袋。
        </Text>
      </View>

      {/* 特殊款 / 基础款 左右切换 */}
      <Pressable
        accessibilityLabel="我的纪念品"
        accessibilityRole="button"
        onPress={() => router.push("/gifts")}
        style={({ pressed }) => [{ alignItems: "center", borderColor: colors.warmAccent, borderRadius: 14, borderWidth: 1, padding: 12 }, pressed && styles.pressed]}
      >
        <Text style={{ color: colors.warmAccent, fontFamily: bodyFont, fontWeight: "800" }}>登录 / 我的纪念品</Text>
      </Pressable>

      <View style={styles.tierToggle}>
        <Pressable
          accessibilityLabel="查看特殊款"
          accessibilityRole="button"
          accessibilityState={{ selected: activeTier === "special" }}
          onPress={() => setActiveTier("special")}
          style={[styles.tierTab, activeTier === "special" ? styles.tierTabActive : styles.tierTabInactive]}
        >
          <Text style={[styles.tierTitle, activeTier === "special" && styles.tierTitleActive]}>
            特殊款
          </Text>
          <Text style={[styles.tierCaption, activeTier === "special" && styles.tierCaptionActive]}>
            CITY EDITIONS
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="查看基础款"
          accessibilityRole="button"
          accessibilityState={{ selected: activeTier === "basic" }}
          onPress={() => setActiveTier("basic")}
          style={[styles.tierTab, activeTier === "basic" ? styles.tierTabActive : styles.tierTabInactive]}
        >
          <Text style={[styles.tierTitle, activeTier === "basic" && styles.tierTitleActive]}>
            基础款
          </Text>
          <Text style={[styles.tierCaption, activeTier === "basic" && styles.tierCaptionActive]}>
            EVERYDAY
          </Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {(activeTier === "special" ? specialSkus : basicSkus).map((sku) => (
          <SkuGridCard
            key={sku.id}
            favorited={isFavoriteSku(favoriteIds, sku.id)}
            sku={sku}
            onPress={() => openSku(sku.id)}
            onToggleFavorite={() => void onToggleFavorite(sku.id)}
          />
        ))}
      </View>

      <Text selectable style={styles.disclaimer}>{demoQuoteDisclaimer}</Text>
      <Text selectable style={styles.physicalGoods}>
        所有商品为实体手作纪念品，含配送与门店自取服务。
      </Text>
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
  const imageSource = sku.image ? getSouvenirImage(sku.image) : null;

  return (
    <Pressable
      accessibilityLabel={`查看商品详情：${sku.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.imageFrame}>
        {imageSource ? (
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={imageSource}
            style={styles.swatchImage}
          />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: city ? city.color : colors.paper }]}>
            <Text selectable style={styles.swatchText}>
              {city ? city.name.slice(0, 1) : kindGlyphs[sku.kind]}
            </Text>
          </View>
        )}
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
          {city ? `${city.name}系列` : "通用款"} · {sku.craft.process}
        </Text>
        <Text selectable style={styles.cardPrice}>{formatCny(quote.amount)} <Text style={styles.cardFrom}>起</Text></Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { gap: 24, padding: 20, paddingTop: 12, paddingBottom: 36 },
  bagButton: {
    alignItems: "center",
    borderColor: colors.ink,
    borderRadius: 18,
    borderWidth: 1.5,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  bagIcon: { color: colors.accent, fontFamily: serifFont, fontSize: 18 },
  hero: {
    borderColor: colors.ink,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 10,
    padding: 14,
  },
  heroSketch: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  heroSketchText: { color: colors.ink, fontFamily: serifFont, fontSize: 22 },
  heroSketchLine: { color: colors.muted, fontFamily: bodyFont, fontSize: 13 },
  heroCopy: { color: colors.ink, fontFamily: bodyFont, fontSize: 13.5, lineHeight: 22 },
  tierToggle: {
    borderRadius: 12,
    borderColor: colors.ink,
    borderWidth: 1.3,
    flexDirection: "row",
    overflow: "hidden",
  },
  tierTab: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    paddingVertical: 14,
  },
  tierTabActive: { backgroundColor: colors.accent },
  tierTabInactive: { backgroundColor: colors.background },
  tierTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 19 },
  tierTitleActive: { color: colors.background },
  tierCaption: { color: colors.muted, fontFamily: bodyFont, fontSize: 11, letterSpacing: 1.5 },
  tierCaptionActive: { color: colors.accentSoft },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 },
  card: {
    backgroundColor: colors.background,
    borderColor: colors.ink,
    borderRadius: 8,
    borderWidth: 1.3,
    overflow: "hidden",
    width: "48.5%",
  },
  imageFrame: {
    aspectRatio: 1,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    padding: 6,
  },
  swatchImage: { borderRadius: 5, height: "100%", width: "100%" },
  placeholder: { alignItems: "center", borderRadius: 5, flex: 1, justifyContent: "center" },
  swatchText: { color: colors.ink, fontFamily: serifFont, fontSize: 42 },
  starButton: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.ink,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 10,
    top: 10,
    width: 32,
  },
  star: { color: colors.ink, fontSize: 18, lineHeight: 22 },
  starFavorited: { color: colors.accent },
  cardBody: { gap: 5, padding: 10 },
  cardTitle: { color: colors.ink, fontFamily: bodyFont, fontSize: 14.5, minHeight: 38 },
  cardMeta: { color: colors.muted, fontFamily: bodyFont, fontSize: 12 },
  cardPrice: { color: colors.accent, fontFamily: serifFont, fontSize: 18 },
  cardFrom: { color: colors.ink, fontFamily: bodyFont, fontSize: 11 },
  disclaimer: { color: colors.muted, fontFamily: bodyFont, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
  physicalGoods: { color: colors.muted, fontFamily: bodyFont, fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  pressed: { opacity: 0.78 },
});
