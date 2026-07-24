import { useRouter } from "expo-router";
import Storage from "expo-sqlite/kv-store";
import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { intendedPriceRanges } from "../../features/commerce/shop/shop-options";
import {
  exportFeedback,
  saveFeedback,
  type FeedbackStorage,
} from "../../features/feedback/feedback-store";

const kvStorage: FeedbackStorage = {
  getItem: (key) => Storage.getItemAsync(key),
  setItem: (key, value) => Storage.setItemAsync(key, value),
};

const materialOptions = ["金属", "布面 / 纸质", "皮质", "都可以"] as const;

const choiceOptions = [
  { id: "yes", label: "愿意" },
  { id: "maybe", label: "再想想" },
  { id: "no", label: "暂时不会" },
] as const;

type Choice = (typeof choiceOptions)[number]["id"];

export default function FeedbackScreen() {
  const router = useRouter();
  const [wouldBuy, setWouldBuy] = useState<Choice | null>(null);
  const [wouldRecommend, setWouldRecommend] = useState<Choice | null>(null);
  const [priceRange, setPriceRange] = useState<string | null>(null);
  const [materialPreference, setMaterialPreference] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "done" | "error">("idle");

  const canSubmit =
    submitState !== "saving" &&
    (wouldBuy !== null || wouldRecommend !== null || priceRange !== null ||
      materialPreference !== null || note.trim() !== "");

  const submit = async () => {
    setSubmitState("saving");
    try {
      await saveFeedback(kvStorage, {
        priceRange: priceRange ?? "未填写",
        materialPreference: materialPreference ?? "未填写",
        wouldBuy: wouldBuy ?? "maybe",
        wouldRecommend: wouldRecommend ?? "maybe",
        note: note.trim(),
        createdAt: new Date().toISOString(),
      });
      setSubmitState("done");
    } catch {
      setSubmitState("error");
    }
  };

  const share = async () => {
    try {
      await Share.share({ message: await exportFeedback(kvStorage) });
    } catch {
      // 用户取消分享时静默返回
    }
  };

  if (submitState === "done") {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.successCard}>
          <Text selectable style={styles.successMark}>✓</Text>
          <Text selectable style={styles.successTitle}>反馈已记录，谢谢你</Text>
          <Text selectable style={styles.subtitle}>
            感谢你的反馈，这能帮助我们做得更好。
          </Text>
          <AppButton label="导出 / 分享全部反馈" tone="secondary" onPress={() => void share()} />
          <AppButton label="返回" onPress={() => router.back()} />
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
        <Text selectable style={styles.title}>意见反馈</Text>
        <Text selectable style={styles.subtitle}>
          全部选填，写多少都可以。
        </Text>
      </View>

      <Section title="你会购买这里的纪念品吗？">
        <View style={styles.chipRow}>
          {choiceOptions.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              selected={wouldBuy === option.id}
              onPress={() => setWouldBuy(option.id)}
            />
          ))}
        </View>
      </Section>

      <Section title="愿意推荐给朋友吗？">
        <View style={styles.chipRow}>
          {choiceOptions.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              selected={wouldRecommend === option.id}
              onPress={() => setWouldRecommend(option.id)}
            />
          ))}
        </View>
      </Section>

      <Section title="更愿意接受的价位">
        <View style={styles.chipRow}>
          {intendedPriceRanges.map((range) => (
            <Chip
              key={range}
              label={range}
              selected={priceRange === range}
              onPress={() => setPriceRange(range)}
            />
          ))}
        </View>
      </Section>

      <Section title="更喜欢的材料">
        <View style={styles.chipRow}>
          {materialOptions.map((material) => (
            <Chip
              key={material}
              label={material}
              selected={materialPreference === material}
              onPress={() => setMaterialPreference(material)}
            />
          ))}
        </View>
      </Section>

      <Section title="想对我们说的话">
        <TextInput
          accessibilityLabel="反馈内容"
          maxLength={200}
          multiline
          onChangeText={setNote}
          placeholder="功能建议、遇到的问题，都欢迎写在这里。"
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
        label={submitState === "saving" ? "正在记录…" : "提交反馈"}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20, paddingBottom: 40 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 20, gap: 8, padding: 18 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  chipLabelSelected: { color: "#FFFFFF" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 96,
    padding: 12,
    textAlignVertical: "top",
  },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: "700", textAlign: "center" },
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
