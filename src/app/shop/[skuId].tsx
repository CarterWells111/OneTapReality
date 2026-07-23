import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { demoCatalog } from "../../features/commerce/catalog/catalog";
import { demoQuoteDisclaimer } from "../../features/commerce/catalog/pricing";
import {
  createOrderIntentId,
  saveOrderIntent,
} from "../../features/commerce/shop/order-intent-store";
import {
  computeStyledTotal,
  computeStyledUnitPrice,
  engravingFieldByKind,
  formatCny,
  getSkuTier,
  intendedPriceRanges,
  maxEngravingLength,
  priceFeelOptions,
  styleOptionsByKind,
  tierLabels,
  type PriceFeel,
} from "../../features/commerce/shop/shop-options";

export default function ShopSkuScreen() {
  const router = useRouter();
  const { skuId } = useLocalSearchParams<{ skuId: string }>();
  const sku = demoCatalog.find((item) => item.id === skuId);

  const styleOptions = sku ? styleOptionsByKind[sku.kind] : [];
  const [styleId, setStyleId] = useState<string | null>(null);
  const [engraving, setEngraving] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [priceFeel, setPriceFeel] = useState<PriceFeel | null>(null);
  const [intendedRange, setIntendedRange] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "done" | "error">("idle");

  if (!sku) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.plainCard}>
          <Text selectable style={styles.blockTitle}>没有找到这件纪念品</Text>
          <Text selectable style={styles.mutedText}>它可能已下架，回商店看看其他的吧。</Text>
          <AppButton label="返回商店" onPress={() => router.back()} />
        </View>
      </ScrollView>
    );
  }

  const selectedStyle = styleOptions.find((option) => option.id === styleId) ?? styleOptions[0];
  const unitPrice = computeStyledUnitPrice(sku, selectedStyle);
  const total = computeStyledTotal(sku, selectedStyle, quantity);
  const engravingLabel = engravingFieldByKind[sku.kind];
  const trimmedEngraving = engraving.trim();
  const city = sku.cityLimited ? cityContent[sku.cityLimited] : null;
  const canSubmit = submitState !== "saving";

  const submit = async () => {
    setSubmitState("saving");
    try {
      await saveOrderIntent({
        id: createOrderIntentId(),
        skuId: sku.id,
        skuName: sku.name,
        styleId: selectedStyle.id,
        styleName: selectedStyle.name,
        engraving: engravingLabel ? trimmedEngraving : "",
        quantity,
        unitPriceCny: unitPrice,
        totalPriceCny: total,
        priceFeel,
        intendedPriceRange: intendedRange ?? "",
        note: note.trim(),
        leadTimeDays: sku.craft.leadTimeDays,
        createdAt: new Date().toISOString(),
      });
      setSubmitState("done");
    } catch {
      setSubmitState("error");
    }
  };

  if (submitState === "done") {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.successCard}>
          <Text selectable style={styles.successMark}>✓</Text>
          <Text selectable style={styles.successTitle}>订购意向已记录</Text>
          <Text selectable style={styles.mutedCenter}>
            {sku.name} · {selectedStyle.name} × {quantity}
            {engravingLabel && trimmedEngraving ? ` · ${engravingLabel}「${trimmedEngraving}」` : ""}
          </Text>
          <Text selectable style={styles.mutedCenter}>
            演示合计 {formatCny(total)}
            {intendedRange ? ` · 愿付价位 ${intendedRange}` : ""}
          </Text>
          <Text selectable style={styles.footNote}>
            仅保存在这台设备上，用于现场收集价格意向，不是真实订单。
          </Text>
          <AppButton label="查看订单记录" onPress={() => router.push("/shop/orders")} />
          <AppButton label="继续逛商店" tone="secondary" onPress={() => router.back()} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <View style={styles.tagRow}>
          <Text selectable style={styles.tag}>{tierLabels[getSkuTier(sku)]}</Text>
          {city ? <Text selectable style={styles.tagWarm}>{city.name}限定</Text> : null}
        </View>
        <Text selectable style={styles.title}>{sku.name}</Text>
        <Text selectable style={styles.priceLine}>
          单件 {formatCny(unitPrice)} · 演示价 · 约 {sku.craft.leadTimeDays} 天制作
        </Text>
      </View>

      <Section title="材料与工艺 · 可追溯">
        <View style={styles.plainCard}>
          {sku.materials.map((material) => (
            <Text key={material.name} selectable style={styles.traceLine}>
              · {material.name} —— {material.source}
            </Text>
          ))}
          <Text selectable style={styles.traceLine}>
            · 工艺：{sku.craft.process}（{sku.craft.workshop}）
          </Text>
        </View>
      </Section>

      <Section title="选择订购样式">
        <View style={styles.chipRow}>
          {styleOptions.map((option) => (
            <Chip
              key={option.id}
              label={option.name}
              note={`${option.note}${option.deltaCny > 0 ? ` · +¥${option.deltaCny}` : ""}`}
              selected={option.id === selectedStyle.id}
              onPress={() => setStyleId(option.id)}
            />
          ))}
        </View>
      </Section>

      {engravingLabel ? (
        <Section title={`${engravingLabel} · 选填`}>
          <TextInput
            accessibilityLabel={engravingLabel}
            maxLength={maxEngravingLength}
            onChangeText={setEngraving}
            placeholder="例如：杭州 · 如初"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={engraving}
          />
          <Text selectable style={styles.counter}>
            {engraving.length}/{maxEngravingLength}
          </Text>
          {trimmedEngraving ? (
            <View style={styles.engravePreview}>
              <Text selectable style={styles.engraveText}>「{trimmedEngraving}」</Text>
              <Text selectable style={styles.mutedSmall}>将以激光工艺呈现在{engravingLabel === "背面刻字" ? "钥匙背面" : "封面"}</Text>
            </View>
          ) : null}
        </Section>
      ) : null}

      <Section title="数量">
        <View style={styles.stepperRow}>
          <StepperButton disabled={quantity <= 1} label="−" onPress={() => setQuantity((q) => Math.max(1, q - 1))} />
          <Text selectable style={styles.stepperValue}>{quantity}</Text>
          <StepperButton disabled={quantity >= 9} label="+" onPress={() => setQuantity((q) => Math.min(9, q + 1))} />
        </View>
      </Section>

      <View style={styles.totalCard}>
        <Text selectable style={styles.totalLine}>合计 {formatCny(total)}</Text>
        <Text selectable style={styles.mutedSmall}>
          {selectedStyle.name} · 单件 {formatCny(unitPrice)} × {quantity} 件
        </Text>
        <Text selectable style={styles.mutedSmall}>{demoQuoteDisclaimer}</Text>
      </View>

      <Section title="价格意向 · 帮我们定价（选填）">
        <Text selectable style={styles.mutedText}>这个价格你觉得怎么样？</Text>
        <View style={styles.chipRow}>
          {priceFeelOptions.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              selected={priceFeel === option.id}
              onPress={() => setPriceFeel(option.id)}
            />
          ))}
        </View>
        <Text selectable style={styles.mutedText}>你更愿意为它付多少？</Text>
        <View style={styles.chipRow}>
          {intendedPriceRanges.map((range) => (
            <Chip
              key={range}
              label={range}
              selected={intendedRange === range}
              onPress={() => setIntendedRange(range)}
            />
          ))}
        </View>
        <TextInput
          accessibilityLabel="价格建议"
          maxLength={60}
          onChangeText={setNote}
          placeholder="一句话建议（选填）"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={note}
        />
      </Section>

      {submitState === "error" ? (
        <Text selectable style={styles.errorText}>没有保存成功，请再试一次。</Text>
      ) : null}
      <AppButton
        disabled={!canSubmit}
        label={submitState === "saving" ? "正在记录…" : "提交订购意向（演示）"}
        onPress={submit}
      />
      <Text selectable style={styles.footNote}>
        提交后仅在本机记录订购与价格意向，不会付款、不会产生真实订单。
      </Text>
    </ScrollView>
  );
}

function Chip({
  label,
  note,
  selected,
  onPress,
}: {
  label: string;
  note?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text selectable style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      {note ? (
        <Text selectable style={[styles.chipNote, selected && styles.chipNoteSelected]}>{note}</Text>
      ) : null}
    </Pressable>
  );
}

function StepperButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepperButton,
        disabled && { opacity: 0.35 },
        pressed && styles.pressed,
      ]}
    >
      <Text selectable style={styles.stepperButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20, paddingBottom: 40 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 20, gap: 8, padding: 18 },
  tagRow: { flexDirection: "row", gap: 8 },
  tag: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagWarm: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    color: colors.warmAccent,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  priceLine: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  plainCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  blockTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  traceLine: { color: colors.muted, fontSize: 13.5, lineHeight: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  chipLabelSelected: { color: "#FFFFFF" },
  chipNote: { color: colors.muted, fontSize: 11.5 },
  chipNoteSelected: { color: "#E3EAF2" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  counter: { alignSelf: "flex-end", color: colors.muted, fontSize: 12 },
  engravePreview: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.warmAccent,
    borderRadius: 14,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  engraveText: { color: colors.warmAccent, fontSize: 18, fontWeight: "800", letterSpacing: 2 },
  stepperRow: { alignItems: "center", flexDirection: "row", gap: 14 },
  stepperButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  stepperButtonText: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  stepperValue: { color: colors.ink, fontSize: 18, fontWeight: "800", minWidth: 28, textAlign: "center" },
  totalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  totalLine: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  mutedText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  mutedSmall: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  mutedCenter: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: "700", textAlign: "center" },
  footNote: { color: colors.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
  successCard: {
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 22,
  },
  successMark: { color: colors.accent, fontSize: 40, fontWeight: "800", textAlign: "center" },
  successTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", textAlign: "center" },
  pressed: { opacity: 0.85 },
});
