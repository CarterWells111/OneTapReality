import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { demoCatalog, type CatalogSku, type SkuKind } from "../../features/commerce/catalog/catalog";
import { computeDemoQuote, demoQuoteDisclaimer } from "../../features/commerce/catalog/pricing";
import {
  engravingFieldByKind,
  formatCny,
  getSkuTier,
} from "../../features/commerce/shop/shop-options";

const kindGlyphs: Record<SkuKind, string> = {
  "city-key": "钥",
  "album-print": "册",
  "sticker-pack": "贴",
};

export default function ShopScreen() {
  const router = useRouter();
  const specialSkus = demoCatalog.filter((sku) => getSkuTier(sku) === "special");
  const basicSkus = demoCatalog.filter((sku) => getSkuTier(sku) === "basic");

  const openSku = (skuId: string) => {
    router.push({ pathname: "/shop/[skuId]", params: { skuId } });
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
          <Text selectable style={styles.heroLinkText}>查看已收集的订购意向 ›</Text>
        </Pressable>
      </View>

      <Section title="特殊款 · 城市限定">
        <View style={styles.cardList}>
          {specialSkus.map((sku) => (
            <SkuCard key={sku.id} sku={sku} onPress={() => openSku(sku.id)} />
          ))}
        </View>
      </Section>

      <Section title="基础款 · 经典通用">
        <View style={styles.cardList}>
          {basicSkus.map((sku) => (
            <SkuCard key={sku.id} sku={sku} onPress={() => openSku(sku.id)} />
          ))}
        </View>
      </Section>

      <Text selectable style={styles.disclaimer}>{demoQuoteDisclaimer}</Text>
    </ScrollView>
  );
}

function SkuCard({ sku, onPress }: { sku: CatalogSku; onPress: () => void }) {
  const quote = computeDemoQuote(sku);
  const city = sku.cityLimited ? cityContent[sku.cityLimited] : null;
  const canEngrave = engravingFieldByKind[sku.kind] !== null;

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
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={1} selectable style={styles.cardTitle}>{sku.name}</Text>
        <Text numberOfLines={1} selectable style={styles.cardMeta}>
          {city ? `${city.name}限定` : "通用款"} · {sku.craft.process}
        </Text>
        <Text numberOfLines={1} selectable style={styles.cardMeta}>
          约 {sku.craft.leadTimeDays} 天制作 · 可选样式{canEngrave ? " · 可刻字" : ""}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <Text selectable style={styles.cardPrice}>{formatCny(quote.amount)}</Text>
        <Text selectable style={styles.cardFrom}>起 · 演示价</Text>
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
  cardList: { gap: 12 },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  swatch: { alignItems: "center", borderRadius: 14, height: 64, justifyContent: "center", width: 64 },
  swatchText: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: colors.muted, fontSize: 12.5 },
  cardRight: { alignItems: "flex-end", gap: 2 },
  cardPrice: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  cardFrom: { color: colors.muted, fontSize: 11.5 },
  disclaimer: { color: colors.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
  pressed: { opacity: 0.85 },
});
