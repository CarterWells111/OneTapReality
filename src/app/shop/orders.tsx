import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { AppButton, bodyFont, colors, ScreenTitle, serifFont, SketchDivider } from "../../components/ui";
import {
  clearOrderIntents,
  exportOrderIntents,
  formatIntentTime,
  listOrderIntents,
  type OrderIntent,
} from "../../features/commerce/shop/order-intent-store";
import {
  defaultLeadTimeDays,
  getOrderStage,
  getOrderTimeline,
  orderStageLabels,
} from "../../features/commerce/shop/order-status";
import { formatCny, priceFeelLabels } from "../../features/commerce/shop/shop-options";

export default function ShopOrdersScreen() {
  const router = useRouter();
  const [intents, setIntents] = useState<OrderIntent[]>([]);
  const [isReady, setIsReady] = useState(false);

  const load = useCallback(async () => {
    const stored = await listOrderIntents();
    setIntents(stored);
    setIsReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => computeBagSummary(intents), [intents]);

  const share = async () => {
    try {
      await Share.share({ message: exportOrderIntents(intents) });
    } catch {
      // 用户取消分享时静默返回。
    }
  };

  const confirmClear = () => {
    Alert.alert("清空购物袋", "将删除这台设备上保存的全部订购意向，且无法恢复。", [
      { text: "取消", style: "cancel" },
      {
        text: "清空",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await clearOrderIntents();
            setIntents([]);
          })();
        },
      },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <ScreenTitle title="购物袋" caption="LOCAL BAG" />
        <Text selectable style={styles.countText}>
          {intents.length} 件商品
        </Text>
      </View>

      {!isReady ? (
        <Text selectable style={styles.mutedText}>正在读取本机购物袋...</Text>
      ) : intents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text selectable style={styles.emptyTitle}>购物袋还是空的</Text>
          <Text selectable style={styles.emptyCopy}>
            去商店里挑一件纸页纪念品，先放进袋子里，再慢慢决定。
          </Text>
          <AppButton label="去商店逛逛" onPress={() => router.replace("/shop")} />
        </View>
      ) : (
        <>
          <View style={styles.list}>
            {intents.map((intent) => (
              <BagItemCard key={intent.id} intent={intent} />
            ))}
          </View>

          <View style={styles.couponCard}>
            <View style={styles.tape} />
            <Text selectable style={styles.couponTitle}>优惠券</Text>
            <Text selectable style={styles.couponLine}>手写旅行日记 减 {formatCny(summary.discount)}</Text>
            <Text selectable style={styles.couponSmall}>有效期至本地演示结束</Text>
            <Text style={styles.chevron}>›</Text>
          </View>

          <View style={styles.addressCard}>
            <Text selectable style={styles.addressTitle}>收货地址</Text>
            <Text selectable style={styles.addressLine}>南宁 - 广州</Text>
            <Text selectable style={styles.addressLine}>陈小雨　138****5618</Text>
            <Text style={styles.chevron}>›</Text>
          </View>

          <View style={styles.summaryCard}>
            <SummaryRow label={`商品小计（${intents.length}件）`} value={formatCny(summary.subtotal)} />
            <SummaryRow label="运费" value={formatCny(summary.shipping)} />
            <SummaryRow label="优惠券" value={`-${formatCny(summary.discount)}`} tone="accent" />
            <SketchDivider />
            <SummaryRow label="合计" value={formatCny(summary.total)} tone="accent" large />
          </View>

          <AppButton label="去结算（演示）" onPress={() => void share()} />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => void share()} style={styles.textAction}>
              <Text selectable style={styles.textActionLabel}>导出购物袋文本</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={confirmClear} style={styles.textAction}>
              <Text selectable style={styles.clearLabel}>清空购物袋</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function BagItemCard({ intent }: { intent: OrderIntent }) {
  const leadTimeDays = intent.leadTimeDays ?? defaultLeadTimeDays;
  const now = new Date();
  const stage = getOrderStage(intent.createdAt, leadTimeDays, now);
  const timeline = getOrderTimeline(intent.createdAt, leadTimeDays, now);
  const shippedEntry = timeline.find((entry) => entry.stage === "shipped");
  const deliveredEntry = timeline.find((entry) => entry.stage === "delivered");
  const glyph = intent.skuName.slice(0, 1);

  return (
    <View style={styles.card}>
      <View style={styles.itemArt}>
        <Text selectable style={styles.itemGlyph}>{glyph}</Text>
      </View>
      <View style={styles.itemBody}>
        <View style={styles.itemTop}>
          <Text numberOfLines={2} selectable style={styles.itemTitle}>
            {intent.skuName}
          </Text>
          <View style={styles.removeCircle}>
            <Text style={styles.removeText}>×</Text>
          </View>
        </View>
        <Text selectable style={styles.itemMeta}>
          {intent.styleName} · {orderStageLabels[stage]}
        </Text>
        {intent.engraving ? (
          <Text selectable style={styles.itemMeta}>刻字：{intent.engraving}</Text>
        ) : null}
        <Text selectable style={styles.price}>{formatCny(intent.totalPriceCny)}</Text>
        <View style={styles.itemBottom}>
          <View style={styles.miniStepper}>
            <Text style={styles.miniStep}>−</Text>
            <Text selectable style={styles.miniQuantity}>{intent.quantity}</Text>
            <Text style={styles.miniStep}>+</Text>
          </View>
          <Text selectable style={styles.itemTime}>{formatIntentTime(intent.createdAt)}</Text>
        </View>
        <View style={styles.tinyTimeline}>
          {timeline.map((entry) => (
            <View key={entry.stage} style={[styles.tinyDot, entry.reached && styles.tinyDotReached]} />
          ))}
        </View>
        {stage !== "delivered" ? (
          <Text selectable style={styles.itemMeta}>
            预计 {shippedEntry?.expectedDate} 寄出 · {deliveredEntry?.expectedDate} 到达
          </Text>
        ) : null}
        <Text selectable style={styles.itemMeta}>
          价格感受：{intent.priceFeel ? priceFeelLabels[intent.priceFeel] : "未填写"} · 愿付：
          {intent.intendedPriceRange || "未填写"}
        </Text>
        {intent.note ? <Text selectable style={styles.itemMeta}>备注：{intent.note}</Text> : null}
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  large = false,
}: {
  label: string;
  value: string;
  tone?: "accent";
  large?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text selectable style={[styles.summaryLabel, large && styles.summaryLarge]}>
        {label}
      </Text>
      <Text selectable style={[styles.summaryValue, tone === "accent" && styles.summaryAccent, large && styles.summaryLarge]}>
        {value}
      </Text>
    </View>
  );
}

function computeBagSummary(intents: OrderIntent[]) {
  const subtotal = intents.reduce((sum, intent) => sum + intent.totalPriceCny, 0);
  const shipping = intents.length > 0 ? 6 : 0;
  const discount = intents.length > 0 ? 10 : 0;
  return {
    subtotal,
    shipping,
    discount,
    total: Math.max(0, Math.round((subtotal + shipping - discount) * 100) / 100),
  };
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20, paddingBottom: 42 },
  headerRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  countText: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, marginTop: 28 },
  mutedText: { color: colors.muted, fontFamily: bodyFont, fontSize: 14 },
  emptyCard: {
    backgroundColor: colors.paper,
    borderColor: colors.ink,
    borderRadius: 8,
    borderWidth: 1.3,
    gap: 14,
    padding: 20,
  },
  emptyTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 24 },
  emptyCopy: { color: colors.ink, fontFamily: bodyFont, fontSize: 15, lineHeight: 24 },
  list: { gap: 18 },
  card: {
    backgroundColor: colors.background,
    borderColor: colors.ink,
    borderRadius: 8,
    borderWidth: 1.3,
    flexDirection: "row",
    gap: 14,
    padding: 12,
  },
  itemArt: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 4,
    borderWidth: 1,
    height: 92,
    justifyContent: "center",
    width: 88,
  },
  itemGlyph: { color: colors.ink, fontFamily: serifFont, fontSize: 38 },
  itemBody: { flex: 1, gap: 6 },
  itemTop: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  itemTitle: { color: colors.ink, flex: 1, fontFamily: serifFont, fontSize: 20, lineHeight: 26 },
  removeCircle: {
    alignItems: "center",
    borderColor: colors.ink,
    borderRadius: 14,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  removeText: { color: colors.ink, fontFamily: bodyFont, fontSize: 15 },
  itemMeta: { color: colors.ink, fontFamily: bodyFont, fontSize: 13.5, lineHeight: 20 },
  price: { color: colors.accent, fontFamily: serifFont, fontSize: 19 },
  itemBottom: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  miniStepper: { alignItems: "center", flexDirection: "row", gap: 12 },
  miniStep: {
    borderColor: colors.ink,
    borderRadius: 13,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 17,
    height: 26,
    lineHeight: 24,
    textAlign: "center",
    width: 26,
  },
  miniQuantity: { color: colors.ink, fontFamily: bodyFont, fontSize: 16 },
  itemTime: { color: colors.muted, fontFamily: bodyFont, fontSize: 11.5 },
  tinyTimeline: { flexDirection: "row", gap: 5, paddingTop: 2 },
  tinyDot: { backgroundColor: colors.line, borderRadius: 4, height: 8, width: 8 },
  tinyDotReached: { backgroundColor: colors.accent },
  couponCard: {
    backgroundColor: colors.background,
    borderColor: colors.ink,
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  tape: { backgroundColor: colors.accent, height: 10, left: 14, position: "absolute", top: -5, width: 44 },
  couponTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 18 },
  couponLine: { color: colors.ink, fontFamily: bodyFont, fontSize: 15 },
  couponSmall: { color: colors.muted, fontFamily: bodyFont, fontSize: 12.5 },
  addressCard: {
    backgroundColor: colors.background,
    borderColor: colors.ink,
    borderRadius: 5,
    borderWidth: 1,
    gap: 5,
    padding: 16,
  },
  addressTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 18 },
  addressLine: { color: colors.ink, fontFamily: bodyFont, fontSize: 14.5 },
  chevron: { color: colors.ink, fontFamily: serifFont, fontSize: 26, position: "absolute", right: 16, top: 22 },
  summaryCard: { gap: 10, paddingVertical: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { color: colors.ink, fontFamily: bodyFont, fontSize: 15 },
  summaryValue: { color: colors.ink, fontFamily: bodyFont, fontSize: 15 },
  summaryAccent: { color: colors.accent },
  summaryLarge: { fontFamily: serifFont, fontSize: 21 },
  actions: { flexDirection: "row", justifyContent: "space-between" },
  textAction: { paddingVertical: 8 },
  textActionLabel: { color: colors.muted, fontFamily: bodyFont, fontSize: 13.5 },
  clearLabel: { color: colors.accent, fontFamily: bodyFont, fontSize: 13.5 },
});
