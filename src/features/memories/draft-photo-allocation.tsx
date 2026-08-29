import * as React from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View, type DimensionValue, type ListRenderItemInfo } from "react-native";

import { colors, bodyFont, PaperCard, serifFont } from "../../components/ui";
import { PhotoTemplatePicker } from "../canvas/photo-template-picker";
import { createPhotoTemplateLayout, PHOTO_TEMPLATE_FAMILIES, resolvePhotoTemplate } from "../canvas/photo-templates";
import { createPhotoLayout, MAX_PHOTOS_PER_CANVAS_PAGE } from "../canvas/auto-layout";
import {
  applyTemplateFamilyToPlans,
  distributePhotoUris,
  movePhotoToPage,
  MAX_PHOTOS_PER_PAGE_ERROR,
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

const percentage = (value: number): DimensionValue => `${Number((value * 100).toFixed(4))}%`;
const PHOTO_ITEM_WIDTH = 80;
const PHOTO_ITEM_GAP = 8;
const PHOTO_ITEM_STRIDE = PHOTO_ITEM_WIDTH + PHOTO_ITEM_GAP;
const PAGE_PREVIEW_WIDTH = 112;
const PAGE_PREVIEW_GAP = 10;
const PAGE_PREVIEW_STRIDE = PAGE_PREVIEW_WIDTH + PAGE_PREVIEW_GAP;

function DraftPagePreview({ plan, pageIndex }: { plan: MemoryDraftPagePlan; pageIndex: number }) {
  const template = resolvePhotoTemplate(plan.photoTemplateId);
  const templateLayout = plan.photoTemplateId ? createPhotoTemplateLayout(plan.photoUris, plan.photoTemplateId) : null;
  const layout = templateLayout ?? createPhotoLayout(plan.photoUris);
  const layoutLabel = templateLayout && template ? `${template.familyLabel}模板` : "自由排版";

  return (
    <View
      accessible
      accessibilityLabel={`第 ${pageIndex + 1} 页预览，${plan.photoUris.length} 张照片，${layoutLabel}`}
      style={styles.pagePreview}
    >
      <View style={styles.previewCanvas} testID={`draft-photo-preview-${pageIndex + 1}`}>
        {layout.elements.map((element) => element.type === "image" ? (
          <Image
            resizeMode="cover"
            key={element.id}
            source={{ uri: element.uri }}
            style={{
              height: percentage(element.height),
              left: percentage(element.x),
              position: "absolute",
              top: percentage(element.y),
              transform: [{ rotate: `${element.rotation}rad` }],
              width: percentage(element.width),
            }}
            testID={`draft-photo-preview-${pageIndex + 1}-${element.id}`}
          />
        ) : null)}
      </View>
      <Text selectable style={styles.previewPageLabel}>第 {pageIndex + 1} 页</Text>
      <Text selectable style={styles.previewCount}>{plan.photoUris.length} 张照片 · {layoutLabel}</Text>
    </View>
  );
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
    const minimumPageCount = Math.max(1, Math.ceil(photoUris.length / MAX_PHOTOS_PER_CANVAS_PAGE));
    const nextCount = Math.min(photoUris.length, Math.max(minimumPageCount, value.length + delta));
    if (nextCount === value.length) return;

    try {
      const result = applyTemplateFamilyToPlans(distributePhotoUris(photoUris, nextCount), selectedFamily);
      onChange(result.plans);
      setMessage(result.skippedPageNumbers.length ? skippedMessage(result.skippedPageNumbers) : "");
      setError("");
    } catch {
      setError("无法调整内容页数，请减少每页照片数量后重试。");
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
          <Text selectable style={styles.totalPhotos}>共 {photoUris.length} 张照片</Text>
          <View style={styles.pageCountRow}>
            <Text selectable style={styles.pageCount}>{value.length} 个内容页</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel="减少内容页数"
                accessibilityRole="button"
                accessibilityState={{ disabled: value.length <= Math.max(1, Math.ceil(photoUris.length / MAX_PHOTOS_PER_CANVAS_PAGE)) }}
                disabled={value.length <= Math.max(1, Math.ceil(photoUris.length / MAX_PHOTOS_PER_CANVAS_PAGE))}
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
          {value.length > 0 ? (
            <Text selectable style={styles.suggestion}>
              建议均衡分配：{value.map((plan, index) => `第 ${index + 1} 页 ${plan.photoUris.length} 张`).join("，")}
            </Text>
          ) : null}
          <FlatList
            contentContainerStyle={styles.previewRow}
            data={value}
            getItemLayout={(_, index) => ({ length: PAGE_PREVIEW_STRIDE, offset: PAGE_PREVIEW_STRIDE * index, index })}
            horizontal
            initialNumToRender={6}
            keyExtractor={(_, index) => `preview-${index}`}
            renderItem={({ item: plan, index }) => <DraftPagePreview pageIndex={index} plan={plan} />}
            showsHorizontalScrollIndicator={false}
            windowSize={5}
          >
          </FlatList>
          {message ? <Text selectable style={styles.message}>{message}</Text> : null}
          {error ? <Text selectable style={styles.error}>{error}</Text> : null}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.progressRow}>
            <Text selectable style={styles.progressText}>第 {Math.min(activePageIndex + 1, Math.max(1, value.length))} 页，共 {value.length} 页</Text>
            <Text selectable style={styles.progressText}>剩余 {value.slice(activePageIndex + 1).reduce((count, plan) => count + plan.photoUris.length, 0)} 张照片</Text>
          </View>
          <View style={styles.pageSelectorRow}>
            {value.map((plan, index) => {
              const selected = activePageIndex === index;
              return (
                <Pressable
                  accessibilityLabel={`编辑第 ${index + 1} 页，${plan.photoUris.length} 张照片`}
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

          <FlatList
            contentContainerStyle={styles.photoMoveList}
            data={photoUris}
            extraData={{ activePageIndex, value }}
            getItemLayout={(_, index) => ({ length: PHOTO_ITEM_STRIDE, offset: PHOTO_ITEM_STRIDE * index, index })}
            horizontal
            initialNumToRender={12}
            keyExtractor={(_, index) => `photo-${index}`}
            renderItem={({ item: photoUri, index: photoIndex }: ListRenderItemInfo<string>) => {
              const sourceIndex = value.findIndex((plan) => plan.photoUris.includes(photoUri));
              const isCurrentPage = sourceIndex === activePageIndex;
              const targetIsFull = activePlan?.photoUris.length >= MAX_PHOTOS_PER_CANVAS_PAGE;
              const disabled = sourceIndex < 0 || isCurrentPage || value[sourceIndex]?.photoUris.length === 1 || targetIsFull;
              const label = isCurrentPage
                ? `照片 ${photoIndex + 1}，当前第 ${activePageIndex + 1} 页`
                : `把照片 ${photoIndex + 1} 分配到第 ${activePageIndex + 1} 页`;
              return (
                <Pressable
                  accessibilityHint={targetIsFull ? MAX_PHOTOS_PER_PAGE_ERROR : undefined}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected: isCurrentPage }}
                  disabled={disabled}
                  onPress={() => movePhoto(photoUri, activePageIndex)}
                  style={[styles.photoItem, isCurrentPage && styles.photoItemSelected, disabled && !isCurrentPage && styles.moveButtonDisabled]}
                >
                  <Image
                    accessible={false}
                    resizeMode="cover"
                    source={{ uri: photoUri }}
                    style={styles.photoThumbnail}
                    testID={`draft-photo-thumbnail-${photoIndex + 1}`}
                  />
                  <Text selectable style={styles.photoItemNumber}>照片 {photoIndex + 1}</Text>
                  <Text selectable style={styles.photoItemPage}>{isCurrentPage ? "当前页" : `第 ${sourceIndex + 1} 页`}</Text>
                </Pressable>
              );
            }}
            showsHorizontalScrollIndicator={false}
            windowSize={5}
          />

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
          {value.some((plan) => plan.photoUris.length >= MAX_PHOTOS_PER_CANVAS_PAGE) ? (
            <Text selectable style={styles.error}>{MAX_PHOTOS_PER_PAGE_ERROR}</Text>
          ) : null}
          {error ? <Text selectable style={styles.error}>{error}</Text> : null}
          <View style={styles.navigationRow}>
            <Pressable
              accessibilityLabel="返回上一页"
              accessibilityRole="button"
              accessibilityState={{ disabled: activePageIndex === 0 }}
              disabled={activePageIndex === 0}
              onPress={() => setActivePageIndex((current) => Math.max(0, current - 1))}
              style={[styles.navigationButton, activePageIndex === 0 && styles.navigationButtonDisabled]}
            >
              <Text selectable style={styles.navigationText}>返回上一页</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (activePageIndex < value.length - 1) {
                  setActivePageIndex((current) => Math.min(value.length - 1, current + 1));
                } else {
                  setMode("together");
                }
              }}
              style={({ pressed }) => [styles.navigationButton, styles.navigationButtonPrimary, pressed && styles.pressed]}
            >
              <Text selectable style={styles.navigationTextPrimary}>
                {activePageIndex < value.length - 1 ? "保存当前页，继续" : "完成逐页配置"}
              </Text>
            </Pressable>
          </View>
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
  totalPhotos: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
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
  photoMoveList: { gap: PHOTO_ITEM_GAP, paddingVertical: 2 },
  photoItem: { alignItems: "center", borderColor: colors.line, borderRadius: 12, borderWidth: 1, gap: 4, minHeight: 108, padding: 6, width: PHOTO_ITEM_WIDTH },
  photoItemSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 2 },
  moveButtonDisabled: { opacity: 0.4 },
  photoItemNumber: { color: colors.ink, fontFamily: bodyFont, fontSize: 11, fontWeight: "700" },
  photoItemPage: { color: colors.muted, fontFamily: bodyFont, fontSize: 10 },
  hint: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  suggestion: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  previewRow: { gap: PAGE_PREVIEW_GAP, paddingVertical: 2 },
  pagePreview: { alignItems: "center", gap: 4, width: PAGE_PREVIEW_WIDTH },
  previewCanvas: { aspectRatio: 3 / 4, backgroundColor: colors.surface, borderColor: colors.paperEdge, borderRadius: 8, borderWidth: 1, overflow: "hidden", position: "relative", width: 108 },
  previewPageLabel: { color: colors.ink, fontFamily: bodyFont, fontSize: 12, fontWeight: "700" },
  previewCount: { color: colors.muted, fontFamily: bodyFont, fontSize: 11, textAlign: "center" },
  progressRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  progressText: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  photoLabelRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  photoThumbnail: { aspectRatio: 3 / 4, backgroundColor: colors.accentSoft, borderRadius: 8, height: 60, width: 45 },
  navigationRow: { flexDirection: "row", gap: 8, justifyContent: "space-between", marginTop: 2 },
  navigationButton: { alignItems: "center", borderColor: colors.line, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 10 },
  navigationButtonDisabled: { opacity: 0.4 },
  navigationButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  navigationText: { color: colors.accent, fontFamily: bodyFont, fontSize: 13, fontWeight: "700" },
  navigationTextPrimary: { color: colors.background, fontFamily: bodyFont, fontSize: 13, fontWeight: "700" },
  message: { color: colors.accent, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.82 },
});
