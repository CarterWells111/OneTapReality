import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, bodyFont, PaperCard, serifFont } from "../../components/ui";
import { PhotoTemplatePicker } from "../canvas/photo-template-picker";
import { PHOTO_TEMPLATE_FAMILIES, resolvePhotoTemplate } from "../canvas/photo-templates";
import {
  applyTemplateFamilyToPlans,
  distributePhotoUris,
  movePhotoToPage,
} from "./photo-page-planner";
import type { MemoryDraftPagePlan, PhotoTemplateFamilyId, PhotoTemplateId } from "../../types/memory";

export type DraftPhotoAllocationProps = {
  photoUris: string[];
  value: MemoryDraftPagePlan[];
  onChange: (plans: MemoryDraftPagePlan[]) => void;
};

type AllocationMode = "together" | "per-page";

function familyFromPlans(plans: readonly MemoryDraftPagePlan[]): PhotoTemplateFamilyId | undefined {
  for (const plan of plans) {
    const family = resolvePhotoTemplate(plan.photoTemplateId)?.familyId;
    if (family) return family;
  }
  return undefined;
}

function skippedMessage(pageNumbers: readonly number[]): string {
  return `第 ${pageNumbers.join("、")} 页保持自由排版`;
}

export function DraftPhotoAllocation({ photoUris, value, onChange }: DraftPhotoAllocationProps) {
  const [mode, setMode] = React.useState<AllocationMode>("together");
  const [activePageIndex, setActivePageIndex] = React.useState(0);
  const [selectedFamily, setSelectedFamily] = React.useState<PhotoTemplateFamilyId>(
    () => familyFromPlans(value) ?? "classic",
  );
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setActivePageIndex((current) => Math.min(current, Math.max(0, value.length - 1)));
    const inferredFamily = familyFromPlans(value);
    if (inferredFamily) setSelectedFamily(inferredFamily);
  }, [value]);

  const changePageCount = (delta: number) => {
    const nextCount = Math.min(photoUris.length, Math.max(1, value.length + delta));
    if (nextCount === value.length) return;

    try {
      const result = applyTemplateFamilyToPlans(distributePhotoUris(photoUris, nextCount), selectedFamily);
      onChange(result.plans);
      setMessage(result.skippedPageNumbers.length ? skippedMessage(result.skippedPageNumbers) : "");
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法调整内容页数");
    }
  };

  const applyFamily = () => {
    const result = applyTemplateFamilyToPlans(value, selectedFamily);
    onChange(result.plans);
    setMessage(result.skippedPageNumbers.length ? skippedMessage(result.skippedPageNumbers) : "");
    setError("");
  };

  const movePhoto = (photoUri: string, targetIndex: number) => {
    const result = movePhotoToPage(value, photoUri, targetIndex);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChange(result.plans);
    setError("");
  };

  const activePlan = value[activePageIndex];

  return (
    <PaperCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text selectable style={styles.title}>照片排版</Text>
          <Text selectable style={styles.caption}>先安排照片，再生成草稿</Text>
        </View>
        <View style={styles.modeRow}>
          {(["together", "per-page"] as const).map((nextMode) => {
            const selected = mode === nextMode;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={nextMode}
                onPress={() => setMode(nextMode)}
                style={[styles.modeButton, selected && styles.modeButtonSelected]}
              >
                <Text selectable style={[styles.modeText, selected && styles.modeTextSelected]}>
                  {nextMode === "together" ? "一起配置" : "逐页配置"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {mode === "together" ? (
        <View style={styles.section}>
          <View style={styles.pageCountRow}>
            <Text selectable style={styles.pageCount}>{value.length} 个内容页</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel="减少内容页数"
                accessibilityRole="button"
                accessibilityState={{ disabled: value.length <= 1 }}
                disabled={value.length <= 1}
                onPress={() => changePageCount(-1)}
                style={styles.stepperButton}
              >
                <Text selectable style={styles.stepperText}>−</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="增加内容页数"
                accessibilityRole="button"
                accessibilityState={{ disabled: value.length >= photoUris.length }}
                disabled={value.length >= photoUris.length}
                onPress={() => changePageCount(1)}
                style={styles.stepperButton}
              >
                <Text selectable style={styles.stepperText}>＋</Text>
              </Pressable>
            </View>
          </View>

          <Text selectable style={styles.label}>选择页面风格</Text>
          <View style={styles.familyRow}>
            {PHOTO_TEMPLATE_FAMILIES.map((family) => {
              const selected = selectedFamily === family.id;
              return (
                <Pressable
                  accessibilityLabel={`${family.label}模板`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={family.id}
                  onPress={() => setSelectedFamily(family.id)}
                  style={[styles.familyButton, selected && styles.familyButtonSelected]}
                >
                  <Text selectable style={styles.familyText}>{family.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={applyFamily}
            style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}
          >
            <Text selectable style={styles.applyText}>应用到全部页面</Text>
          </Pressable>
          {value.some((plan) => plan.photoUris.length > 3) ? (
            <Text selectable style={styles.hint}>超过三张照片将使用自由排版</Text>
          ) : null}
          {message ? <Text selectable style={styles.message}>{message}</Text> : null}
          {error ? <Text selectable style={styles.error}>{error}</Text> : null}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.pageSelectorRow}>
            {value.map((plan, index) => {
              const selected = activePageIndex === index;
              return (
                <Pressable
                  accessibilityLabel={`编辑第 ${index + 1} 页`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={`page-${index + 1}`}
                  onPress={() => setActivePageIndex(index)}
                  style={[styles.pageSelector, selected && styles.pageSelectorSelected]}
                >
                  <Text selectable style={styles.pageSelectorTitle}>第 {index + 1} 页</Text>
                  <Text accessibilityLabel={`第 ${index + 1} 页，${plan.photoUris.length} 张照片`} selectable style={styles.pageSelectorSummary}>
                    {plan.photoUris.length} 张照片
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.photoMoveList}>
            {photoUris.map((photoUri, photoIndex) => {
              const sourceIndex = value.findIndex((plan) => plan.photoUris.includes(photoUri));
              return (
                <View key={photoUri} style={styles.photoMoveRow}>
                  <Text selectable style={styles.photoLabel}>
                    照片 {photoIndex + 1}：{sourceIndex >= 0 ? `第 ${sourceIndex + 1} 页` : "未分配"}
                  </Text>
                  <View style={styles.moveButtons}>
                    {value.map((_, targetIndex) => {
                      const disabled = sourceIndex < 0 || sourceIndex === targetIndex || value[sourceIndex]?.photoUris.length === 1;
                      return (
                        <Pressable
                          accessibilityLabel={`把照片 ${photoIndex + 1} 分配到第 ${targetIndex + 1} 页`}
                          accessibilityRole="button"
                          accessibilityState={{ disabled }}
                          disabled={disabled}
                          key={`${photoUri}-to-${targetIndex}`}
                          onPress={() => movePhoto(photoUri, targetIndex)}
                          style={[styles.moveButton, disabled && styles.moveButtonDisabled]}
                        >
                          <Text selectable style={styles.moveText}>第 {targetIndex + 1} 页</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>

          {activePlan && activePlan.photoUris.length <= 3 ? (
            <PhotoTemplatePicker
              onSelect={(templateId: PhotoTemplateId) => {
                onChange(value.map((plan, index) => index === activePageIndex ? { ...plan, photoTemplateId: templateId } : plan));
                setError("");
              }}
              photoCount={activePlan.photoUris.length}
              selectedTemplateId={activePlan.photoTemplateId}
            />
          ) : activePlan ? (
            <Text selectable style={styles.hint}>当前页超过三张照片，将使用自由排版。</Text>
          ) : null}
          {error ? <Text selectable style={styles.error}>{error}</Text> : null}
        </View>
      )}
    </PaperCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  header: { gap: 12 },
  copy: { gap: 3 },
  title: { color: colors.ink, fontFamily: serifFont, fontSize: 19 },
  caption: { color: colors.muted, fontFamily: bodyFont, fontSize: 12 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeButton: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  modeButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeText: { color: colors.accent, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  modeTextSelected: { color: colors.background },
  section: { gap: 12 },
  pageCountRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  pageCount: { color: colors.ink, fontFamily: serifFont, fontSize: 17, fontVariant: ["tabular-nums"] },
  stepper: { flexDirection: "row", gap: 8 },
  stepperButton: { alignItems: "center", borderColor: colors.line, borderRadius: 12, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  stepperText: { color: colors.accent, fontSize: 23, lineHeight: 26 },
  label: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  familyRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  familyButton: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  familyButtonSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 2 },
  familyText: { color: colors.ink, fontFamily: bodyFont, fontSize: 13 },
  applyButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: 12, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  applyText: { color: colors.background, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  pageSelectorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pageSelector: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, gap: 3, minHeight: 58, paddingHorizontal: 12, paddingVertical: 9 },
  pageSelectorSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 2 },
  pageSelectorTitle: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  pageSelectorSummary: { color: colors.muted, fontFamily: bodyFont, fontSize: 12 },
  photoMoveList: { gap: 10 },
  photoMoveRow: { gap: 7 },
  photoLabel: { color: colors.ink, fontFamily: bodyFont, fontSize: 14 },
  moveButtons: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  moveButton: { borderColor: colors.line, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 },
  moveButtonDisabled: { opacity: 0.4 },
  moveText: { color: colors.accent, fontFamily: bodyFont, fontSize: 12, fontWeight: "700" },
  hint: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  message: { color: colors.accent, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.82 },
});
