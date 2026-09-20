import * as React from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bodyFont, colors } from "../../components/ui";
import type { MemoryDraftPagePlan } from "../../types/memory";
import { reorderPagePhoto } from "../memories/photo-page-planner";
import { applyBookLayoutDraft, type BookLayoutDraft } from "./book-layout-draft";
import { resolveCanvasPreviewContentScale } from "./canvas-display-metrics";
import { CanvasPage } from "./canvas-page";
import { createLegacyLayout } from "./canvas-layout";
import { PhotoTemplatePicker } from "./photo-template-picker";

export function BookLayoutSheet({ draft, onCancel, onApply }: {
  draft: BookLayoutDraft;
  onCancel: () => void;
  onApply: (plans: MemoryDraftPagePlan[]) => boolean;
}) {
  const [plans, setPlans] = React.useState(draft.plans);
  const [index, setIndex] = React.useState(0);
  const [error, setError] = React.useState("");
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const plan = plans[index];
  const previewPage = React.useMemo(() => applyBookLayoutDraft(draft.pages, draft, plans)[index], [draft, plans, index]);
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.title}>再次编辑全部页面</Text>
        <Text style={styles.text}>选择页面，调整照片顺序和模板，预览后点击应用。</Text>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.row}>{draft.pages.map((page, i) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: index === i }} key={page.id} onPress={() => setIndex(i)} style={[styles.button, index === i && styles.selected]}>
              <Text style={styles.text}>第 {i + 1} 页{page.kind === "cover" ? " · 封面" : ""}</Text>
            </Pressable>
          ))}</View>
          {plan ? <>
            <Text style={styles.title}>第 {index + 1} 页 · {plan.photoUris.length} 张照片</Text>
            {previewPage ? <View testID="book-layout-preview" pointerEvents="none" style={styles.preview}>
              <CanvasPage contentScale={resolveCanvasPreviewContentScale(210, width)} interactive={false} layout={previewPage.layout ?? createLegacyLayout(previewPage)} width={210} />
            </View> : null}
            {!plan.photoUris.length ? <Text style={styles.text}>本页没有可调整的照片。</Text> : null}
            {plan.photoUris.map((key, slot) => (
              <View key={key} style={styles.row}>
                <Image source={{ uri: draft.photos.get(key)?.uri }} style={styles.image} />
                <Text style={styles.text}>槽位 {slot + 1}</Text>
                {([-1, 1] as const).map(direction => (
                  <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`槽位 ${slot + 1} 的照片${direction === -1 ? "前移" : "后移"}`}
                    disabled={slot + direction < 0 || slot + direction >= plan.photoUris.length}
                    accessibilityState={{ disabled: slot + direction < 0 || slot + direction >= plan.photoUris.length }}
                    onPress={() => setPlans(current => reorderPagePhoto(current, index, slot, direction))} style={styles.button}>
                    <Text style={styles.text}>{direction === -1 ? "前移" : "后移"}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {plan.photoUris.length > 0 ? <>
              <PhotoTemplatePicker photoCount={plan.photoUris.length} selectedTemplateId={plan.photoTemplateId}
                onSelect={photoTemplateId => setPlans(current => current.map((p, i) => i === index ? { ...p, photoTemplateId } : p))} />
              <Pressable accessibilityRole="button" style={styles.button} onPress={() => setPlans(current => current.map((p, i) => i === index ? { photoUris: p.photoUris } : p))}>
                <Text style={styles.text}>原有自由排版</Text>
              </Pressable>
            </> : null}
          </> : null}
          {error ? <Text accessibilityRole="alert" style={styles.text}>{error}</Text> : null}
        </ScrollView>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.button}><Text style={styles.text}>取消整册配置</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => { if (!onApply(plans)) setError("无法应用，页面可能已变化。请取消后重新打开。"); }}><Text style={styles.text}>应用全部页面</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 18, gap: 12 },
  content: { gap: 16, paddingBottom: 20 },
  title: { fontFamily: bodyFont, fontSize: 20, fontWeight: "700", color: colors.ink },
  text: { fontFamily: bodyFont, fontSize: 14, color: colors.ink },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  button: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, minHeight: 44, justifyContent: "center" },
  preview: { alignItems: "center" },
  selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  image: { width: 48, height: 64, borderRadius: 6 },
});
