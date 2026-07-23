import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
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

  const share = async () => {
    try {
      await Share.share({ message: exportOrderIntents(intents) });
    } catch {
      // 用户取消分享时静默返回
    }
  };

  const confirmClear = () => {
    Alert.alert("清空订单记录", "将删除本机已收集的全部订购意向，且无法恢复。", [
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
      <View style={styles.hero}>
        <Text selectable style={styles.title}>
          订单记录{isReady ? ` · ${intents.length} 单` : ""}
        </Text>
        <Text selectable style={styles.subtitle}>
          订购样式与价格意向仅保存在这台设备上；物流状态按制作周期模拟推进，不是真实订单或快递。
        </Text>
      </View>

      {!isReady ? (
        <Text selectable style={styles.subtitle}>正在读取本机记录…</Text>
      ) : intents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text selectable style={styles.emptyTitle}>还没有订单记录</Text>
          <Text selectable style={styles.subtitle}>
            去商店里挑一件，试试选样式、刻字并提交订购意向。
          </Text>
          <AppButton label="去商店逛逛" onPress={() => router.push("/shop")} />
        </View>
      ) : (
        <>
          <Section title="已提交的订单">
            <View style={styles.list}>
              {intents.map((intent) => (
                <OrderCard key={intent.id} intent={intent} />
              ))}
            </View>
          </Section>

          <View style={styles.actions}>
            <AppButton label="导出 / 分享文本" onPress={() => void share()} />
            <AppButton label="清空记录" tone="danger" onPress={confirmClear} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function OrderCard({ intent }: { intent: OrderIntent }) {
  const leadTimeDays = intent.leadTimeDays ?? defaultLeadTimeDays;
  const now = new Date();
  const stage = getOrderStage(intent.createdAt, leadTimeDays, now);
  const timeline = getOrderTimeline(intent.createdAt, leadTimeDays, now);
  const shippedEntry = timeline.find((entry) => entry.stage === "shipped");
  const deliveredEntry = timeline.find((entry) => entry.stage === "delivered");

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text selectable style={styles.cardTitle}>
          {intent.skuName}（{intent.styleName}）× {intent.quantity}
        </Text>
        <Text selectable style={styles.stageBadge}>{orderStageLabels[stage]}</Text>
      </View>
      <Text selectable style={styles.cardLine}>
        单件 {formatCny(intent.unitPriceCny)} × {intent.quantity} · 合计 {formatCny(intent.totalPriceCny)}（演示价）
      </Text>
      {intent.engraving ? (
        <Text selectable style={styles.cardLine}>刻字：「{intent.engraving}」</Text>
      ) : null}

      <View style={styles.timeline}>
        {timeline.map((entry, index) => (
          <View key={entry.stage} style={styles.timelineStep}>
            <View style={[styles.timelineDot, entry.reached && styles.timelineDotReached]} />
            {index < timeline.length - 1 ? (
              <View
                style={[
                  styles.timelineBar,
                  timeline[index + 1].reached && styles.timelineBarReached,
                ]}
              />
            ) : null}
            <Text
              selectable
              style={[styles.timelineLabel, entry.reached && styles.timelineLabelReached]}
            >
              {entry.label}
            </Text>
          </View>
        ))}
      </View>
      {stage !== "delivered" ? (
        <Text selectable style={styles.cardLine}>
          预计 {shippedEntry?.expectedDate} 寄出 · {deliveredEntry?.expectedDate} 送达（模拟）
        </Text>
      ) : null}

      <Text selectable style={styles.cardLine}>
        价格感受：{intent.priceFeel ? priceFeelLabels[intent.priceFeel] : "未填写"} · 愿付：{intent.intendedPriceRange || "未填写"}
      </Text>
      {intent.note ? (
        <Text selectable style={styles.cardLine}>备注：{intent.note}</Text>
      ) : null}
      <Text selectable style={styles.cardTime}>下单时间 {formatIntentTime(intent.createdAt)}</Text>
    </View>
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
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  cardHeader: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  cardTitle: { color: colors.ink, flex: 1, fontSize: 15.5, fontWeight: "800" },
  stageBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.warmAccent,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cardLine: { color: colors.muted, fontSize: 13.5, lineHeight: 19 },
  timeline: { flexDirection: "row", marginVertical: 6 },
  timelineStep: { alignItems: "center", flex: 1 },
  timelineDot: {
    backgroundColor: colors.line,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  timelineDotReached: { backgroundColor: colors.warmAccent },
  timelineBar: {
    backgroundColor: colors.line,
    height: 2,
    left: "50%",
    marginLeft: 5,
    position: "absolute",
    right: "-50%",
    top: 4,
  },
  timelineBarReached: { backgroundColor: colors.warmAccent },
  timelineLabel: { color: colors.muted, fontSize: 11, marginTop: 5 },
  timelineLabelReached: { color: colors.ink, fontWeight: "700" },
  cardTime: { color: colors.muted, fontSize: 12 },
  actions: { gap: 10 },
});
