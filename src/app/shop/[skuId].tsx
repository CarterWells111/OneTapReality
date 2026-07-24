import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, bodyFont, colors, Section, serifFont, SketchDivider } from "../../components/ui";
import { getSouvenirImage } from "../../features/assets/souvenir-images";
import { cityContent } from "../../features/cities/city-content";
import { demoCatalog, type CatalogSku, type SkuKind } from "../../features/commerce/catalog/catalog";
import { demoQuoteDisclaimer } from "../../features/commerce/catalog/pricing";
import { isFavoriteSku } from "../../features/commerce/shop/favorites";
import { listFavoriteSkuIds, toggleFavorite } from "../../features/commerce/shop/favorites-store";
import { createOrderIntentId, saveOrderIntent } from "../../features/commerce/shop/order-intent-store";
import {
  computeStyledTotal,
  computeStyledUnitPrice,
  engravingFieldByKind,
  formatCny,
  intendedPriceRanges,
  maxEngravingLength,
  priceFeelOptions,
  styleOptionsByKind,
  type PriceFeel,
} from "../../features/commerce/shop/shop-options";

const kindGlyphs: Record<SkuKind, string> = {
  "city-key": "钥",
  "album-print": "册",
  "sticker-pack": "贴",
  "souvenir-pendant": "花",
};

const packagingOptions = ["牛皮纸包装", "礼盒包装", "手写纸封"];

export default function ShopSkuDetailScreen() {
  const router = useRouter();
  const { skuId } = useLocalSearchParams<{ skuId?: string }>();
  const sku = demoCatalog.find((candidate) => candidate.id === skuId);

  if (!sku) {
    return (
      <View style={styles.missing}>
        <Text selectable style={styles.missingTitle}>没有找到这件商品</Text>
        <AppButton label="回到商店" onPress={() => router.replace("/shop")} />
      </View>
    );
  }

  return <SkuDetail sku={sku} />;
}

function SkuDetail({ sku }: { sku: CatalogSku }) {
  const router = useRouter();
  const styleOptions = styleOptionsByKind[sku.kind];
  const engravingLabel = engravingFieldByKind[sku.kind];
  const [styleId, setStyleId] = useState(styleOptions[0].id);
  const [packageName, setPackageName] = useState(packagingOptions[0]);
  const [quantity, setQuantity] = useState(1);
  const [engraving, setEngraving] = useState("");
  const [priceFeel, setPriceFeel] = useState<PriceFeel | null>(null);
  const [intendedPriceRange, setIntendedPriceRange] = useState("");
  const [note, setNote] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    let isActive = true;
    void listFavoriteSkuIds().then((ids) => {
      if (isActive) setFavoriteIds(ids);
    });
    return () => {
      isActive = false;
    };
  }, []);

  const selectedStyle = styleOptions.find((option) => option.id === styleId) ?? styleOptions[0];
  const visual = useMemo(() => getProductVisual(sku), [sku]);
  const unitPrice = computeStyledUnitPrice(sku, selectedStyle);
  const totalPrice = computeStyledTotal(sku, selectedStyle, quantity);
  const favorited = isFavoriteSku(favoriteIds, sku.id);

  const onSave = async () => {
    await saveOrderIntent({
      id: createOrderIntentId(),
      skuId: sku.id,
      skuName: sku.name,
      styleId: selectedStyle.id,
      styleName: `${selectedStyle.name} · ${packageName}`,
      engraving: engravingLabel ? engraving.trim() : "",
      quantity,
      unitPriceCny: unitPrice,
      totalPriceCny: totalPrice,
      priceFeel,
      intendedPriceRange,
      note: note.trim(),
      leadTimeDays: sku.craft.leadTimeDays,
      createdAt: new Date().toISOString(),
    });
    setIsSaved(true);
  };

  const onToggleFavorite = async () => {
    setFavoriteIds(await toggleFavorite(sku.id));
  };

  if (isSaved) {
    return (
      <View style={styles.savedScreen}>
        <View style={styles.savedCard}>
          <Text selectable style={styles.savedMark}>✓</Text>
          <Text selectable style={styles.savedTitle}>已加入购物袋</Text>
          <Text selectable style={styles.savedCopy}>
            {sku.name}已经放好了。购物袋只保存在这台设备上，方便你继续演示。
          </Text>
          <AppButton label="查看购物袋" onPress={() => router.replace("/shop/orders")} />
          <AppButton label="继续逛商店" tone="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.iconButton}>
          <Text style={styles.iconText}>←</Text>
        </Pressable>
        <Text selectable style={styles.pageTitle}>商品详情</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push("/shop/orders")} style={styles.iconButton}>
          <Text style={styles.iconText}>袋</Text>
        </Pressable>
      </View>

      <View style={styles.gallery}>
        <ProductVisual sku={sku} visual={visual} />
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>

      <View style={styles.nameRow}>
        <View style={styles.nameBlock}>
          <Text selectable style={styles.productName}>{sku.name}</Text>
          <Text selectable style={styles.price}>{formatCny(unitPrice)}</Text>
        </View>
        <Pressable
          accessibilityLabel={favorited ? "取消收藏" : "收藏商品"}
          accessibilityRole="button"
          onPress={() => void onToggleFavorite()}
          style={styles.roundAction}
        >
          <Text style={[styles.roundActionText, favorited && styles.activeActionText]}>
            {favorited ? "♥" : "♡"}
          </Text>
        </Pressable>
        <View style={styles.roundAction}>
          <Text style={styles.roundActionText}>↥</Text>
        </View>
      </View>

      <View style={styles.thumbnails}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={[styles.thumbnail, index === 0 && styles.thumbnailActive]}>
            <ProductVisual compact sku={sku} visual={visual} />
          </View>
        ))}
      </View>

      <Text selectable style={styles.description}>
        采集城市里小小的形状，用本地材料和手工工艺重新压进纸页。它适合被夹在旅行册里，也适合在某个傍晚拿出来重新想起那一天。
      </Text>

      <SketchDivider />

      <Section title="款式选择">
        <View style={styles.chipWrap}>
          {styleOptions.map((option) => (
            <Chip
              key={option.id}
              label={option.name}
              selected={option.id === styleId}
              onPress={() => setStyleId(option.id)}
            />
          ))}
        </View>
        <Text selectable style={styles.optionNote}>{selectedStyle.note}</Text>
      </Section>

      <Section title="包装选择">
        <View style={styles.chipWrap}>
          {packagingOptions.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={option === packageName}
              onPress={() => setPackageName(option)}
            />
          ))}
        </View>
      </Section>

      {engravingLabel ? (
        <Section title={engravingLabel}>
          <TextInput
            maxLength={maxEngravingLength}
            onChangeText={setEngraving}
            placeholder="写下想刻的话"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={engraving}
          />
        </Section>
      ) : null}

      <Section title="数量">
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" onPress={() => setQuantity(Math.max(1, quantity - 1))} style={styles.stepButton}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text selectable style={styles.quantity}>{quantity}</Text>
          <Pressable accessibilityRole="button" onPress={() => setQuantity(quantity + 1)} style={styles.stepButton}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="价格感受">
        <View style={styles.chipWrap}>
          {priceFeelOptions.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              selected={option.id === priceFeel}
              onPress={() => setPriceFeel(option.id)}
            />
          ))}
        </View>
        <View style={styles.chipWrap}>
          {intendedPriceRanges.map((range) => (
            <Chip
              key={range}
              label={range}
              selected={range === intendedPriceRange}
              onPress={() => setIntendedPriceRange(range)}
            />
          ))}
        </View>
        <TextInput
          multiline
          onChangeText={setNote}
          placeholder="可写下喜欢或犹豫的地方"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.noteInput]}
          value={note}
        />
      </Section>

      <View style={styles.totalLine}>
        <Text selectable style={styles.totalLabel}>合计</Text>
        <Text selectable style={styles.totalPrice}>{formatCny(totalPrice)}</Text>
      </View>
      <AppButton label="加入购物袋" onPress={() => void onSave()} />
      <Text selectable style={styles.disclaimer}>{demoQuoteDisclaimer}</Text>
    </ScrollView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      <Text selectable style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProductVisual({
  sku,
  visual,
  compact = false,
}: {
  sku: CatalogSku;
  visual: ReturnType<typeof getProductVisual>;
  compact?: boolean;
}) {
  return (
    <View style={[styles.visualBox, compact && styles.visualBoxCompact]}>
      {visual.imageSource ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={visual.imageSource}
          style={styles.visualImage}
        />
      ) : (
        <View style={styles.visualPlaceholder}>
          <Text selectable style={[styles.visualGlyph, compact && styles.visualGlyphCompact]}>
            {visual.glyph}
          </Text>
          {!compact ? <Text selectable style={styles.visualCaption}>{sku.craft.process}</Text> : null}
        </View>
      )}
    </View>
  );
}

function getProductVisual(sku: CatalogSku) {
  const city = sku.cityLimited ? cityContent[sku.cityLimited] : null;
  return {
    imageSource: sku.image ? getSouvenirImage(sku.image) : null,
    glyph: city ? city.name.slice(0, 1) : kindGlyphs[sku.kind],
  };
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20, paddingBottom: 42 },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  iconButton: { alignItems: "center", height: 38, justifyContent: "center", width: 38 },
  iconText: { color: colors.ink, fontFamily: serifFont, fontSize: 25 },
  pageTitle: {
    borderBottomColor: colors.accent,
    borderBottomWidth: 2,
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 22,
    paddingBottom: 4,
  },
  gallery: { alignItems: "center", gap: 12 },
  visualBox: {
    alignItems: "center",
    aspectRatio: 1.32,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    padding: 12,
    width: "100%",
  },
  visualBoxCompact: { aspectRatio: 1.45, padding: 4 },
  visualImage: { height: "100%", width: "100%" },
  visualPlaceholder: { alignItems: "center", gap: 8, justifyContent: "center" },
  visualGlyph: { color: colors.ink, fontFamily: serifFont, fontSize: 82 },
  visualGlyphCompact: { fontSize: 26 },
  visualCaption: { color: colors.muted, fontFamily: bodyFont, fontSize: 13 },
  dots: { flexDirection: "row", gap: 7 },
  dot: { backgroundColor: colors.line, borderRadius: 4, height: 8, width: 8 },
  dotActive: { backgroundColor: colors.accent },
  nameRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  nameBlock: { flex: 1, gap: 6 },
  productName: { color: colors.ink, fontFamily: serifFont, fontSize: 26, lineHeight: 34 },
  price: { color: colors.accent, fontFamily: serifFont, fontSize: 24 },
  roundAction: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
  roundActionText: { color: colors.ink, fontFamily: serifFont, fontSize: 26 },
  activeActionText: { color: colors.accent },
  thumbnails: { flexDirection: "row", gap: 12 },
  thumbnail: {
    borderColor: colors.line,
    borderRadius: 5,
    borderWidth: 1,
    flex: 1,
    padding: 3,
  },
  thumbnailActive: { borderColor: colors.accent },
  description: { color: colors.ink, fontFamily: bodyFont, fontSize: 15, lineHeight: 25 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipSelected: { borderColor: colors.accent },
  chipText: { color: colors.ink, fontFamily: bodyFont, fontSize: 14 },
  chipTextSelected: { color: colors.accent },
  optionNote: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.ink,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: { minHeight: 86, textAlignVertical: "top" },
  stepper: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.ink,
    borderRadius: 3,
    borderWidth: 1,
    flexDirection: "row",
    height: 36,
  },
  stepButton: { alignItems: "center", height: 34, justifyContent: "center", width: 48 },
  stepText: { color: colors.ink, fontFamily: serifFont, fontSize: 24 },
  quantity: {
    borderColor: colors.line,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 17,
    minWidth: 52,
    textAlign: "center",
  },
  totalLine: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 14,
  },
  totalLabel: { color: colors.ink, fontFamily: serifFont, fontSize: 20 },
  totalPrice: { color: colors.accent, fontFamily: serifFont, fontSize: 24 },
  disclaimer: { color: colors.muted, fontFamily: bodyFont, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
  missing: { flex: 1, gap: 14, justifyContent: "center", padding: 24 },
  missingTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 22, textAlign: "center" },
  savedScreen: { flex: 1, justifyContent: "center", padding: 24 },
  savedCard: {
    backgroundColor: colors.paper,
    borderColor: colors.ink,
    borderRadius: 8,
    borderWidth: 1.3,
    gap: 13,
    padding: 20,
  },
  savedMark: { color: colors.accent, fontFamily: serifFont, fontSize: 34, textAlign: "center" },
  savedTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 25, textAlign: "center" },
  savedCopy: { color: colors.ink, fontFamily: bodyFont, fontSize: 15, lineHeight: 24, textAlign: "center" },
  pressed: { opacity: 0.78 },
});
