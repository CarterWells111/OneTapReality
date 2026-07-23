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
    Alert.alert("清空意向记录", "将删除本机已收集的全部订购意向，且无法恢复。", [
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
          订购意向记录{isReady ? ` · ${intents.length} 条` : ""}
        </Text>
        <Text selectable style={styles.subtitle}>
          现场收集的订购样式与价格意向，仅保存在这台设备上，不构成订单或支付。
        </Text>
      </View>

      {!isReady ? (
        <Text selectable style={styles.subtitle}>正在读取本机记录…</Text>
      ) : intents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text selectable style={styles.emptyTitle}>还没有收集到订购意向</Text>
          <Text selectable style={styles.subtitle}>
            去商店里挑一件，试试选样式、刻字并留下价格反馈。
          </Text>
          <AppButton label="去商店逛逛" onPress={() => router.push("/shop")} />
        </View>
      ) : (
        <>
          <Section title="已收集的意向">
            <View style={styles.list}>
              {intents.map((intent) => (
                <View key={intent.id} style={styles.card}>
                  <Text selectable style={styles.cardTitle}>
                    {intent.skuName}（{intent.styleName}）× {intent.quantity}
                  </Text>
                  <Text selectable style={styles.cardLine}>
                    演示合计 {formatCny(intent.totalPriceCny)} · 感受：{priceFeelLabels[intent.priceFeel]} · 愿付：{intent.intendedPriceRange}
                  </Text>
                  {intent.engraving ? (
                    <Text selectable style={styles.cardLine}>刻字：「{intent.engraving}」</Text>
                  ) : null}
                  {intent.note ? (
                    <Text selectable style={styles.cardLine}>备注：{intent.note}</Text>
                  ) : null}
                  <Text selectable style={styles.cardTime}>{formatIntentTime(intent.createdAt)}</Text>
                </View>
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
  cardTitle: { color: colors.ink, fontSize: 15.5, fontWeight: "800" },
  cardLine: { color: colors.muted, fontSize: 13.5, lineHeight: 19 },
  cardTime: { color: colors.muted, fontSize: 12 },
  actions: { gap: 10 },
});
