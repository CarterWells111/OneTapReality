import * as React from "react";
import { Image } from "expo-image";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bodyFont, colors, serifFont } from "../../components/ui";
import type { PhotoTemplateId } from "../../types/memory";
import { createPhotoLayout } from "./auto-layout";
import { PhotoTemplatePicker } from "./photo-template-picker";
import { createPhotoTemplateLayout, resolvePhotoTemplate } from "./photo-templates";

export type PhotoLayoutSheetProps = {
  action: "add" | "edit";
  busy?: boolean;
  photoUris: string[];
  selectedTemplateId?: PhotoTemplateId;
  onCancel: () => void;
  onConfirm: (templateId?: PhotoTemplateId) => void;
  onReplacePhotos: () => void;
};

function matchingTemplate(templateId: PhotoTemplateId | undefined, photoCount: number) {
  const template = resolvePhotoTemplate(templateId);
  return template?.photoCount === photoCount ? template.id : undefined;
}

export function PhotoLayoutSheet({
  action,
  busy = false,
  photoUris,
  selectedTemplateId,
  onCancel,
  onConfirm,
  onReplacePhotos,
}: PhotoLayoutSheetProps) {
  const insets = useSafeAreaInsets();
  const photoCount = photoUris.length;
  const [selection, setSelection] = React.useState<PhotoTemplateId | undefined>(
    () => matchingTemplate(selectedTemplateId, photoCount),
  );

  React.useEffect(() => {
    setSelection(matchingTemplate(selectedTemplateId, photoCount));
  }, [photoCount, selectedTemplateId]);

  const confirmLabel = action === "edit"
    ? "应用照片布局"
    : photoCount > 3
      ? "创建自由排版页面"
      : "创建页面";
  const canUseTemplate = photoCount >= 1 && photoCount <= 3;
  const previewLayout = React.useMemo(
    () => (selection
      ? createPhotoTemplateLayout(photoUris, selection)
      : photoCount > 0
        ? createPhotoLayout(photoUris)
        : null),
    [photoCount, photoUris, selection],
  );
  const percent = (value: number) => `${Math.round(value * 10_000) / 100}%` as const;

  return (
    <Modal animationType="slide" onRequestClose={onCancel} transparent={false} visible>
      <View
        accessibilityState={{ busy }}
        style={[styles.root, { paddingBottom: insets.bottom + 16, paddingTop: insets.top + 12 }]}
        testID="photo-layout-sheet">
        <View style={styles.header}>
          <View style={styles.headingCopy}>
            <Text selectable style={styles.title}>{action === "add" ? "新建照片页面" : "照片布局"}</Text>
            <Text selectable style={styles.count}>{photoCount} 张照片</Text>
          </View>
          <Pressable
            accessibilityLabel="取消照片布局"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onCancel}
            style={styles.cancelButton}
          >
            <Text selectable style={styles.cancelText}>取消</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} testID="photo-layout-content">
          <View style={styles.photoSelectionControls} testID="photo-selection-controls">
            {photoCount > 0 ? (
              <View style={styles.selectedPhotoSection} testID="selected-photo-section">
                <Text selectable style={styles.sectionTitle}>已选择图片</Text>
                <View style={styles.thumbnailRow}>
                  {photoUris.map((uri, index) => (
                    <Image
                      accessibilityLabel={`照片 ${index + 1}`}
                      contentFit="cover"
                      key={`${uri}-${index}`}
                      source={{ uri }}
                      style={styles.thumbnail}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <Pressable
              accessibilityLabel="重新选择照片"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onReplacePhotos}
              style={styles.replaceButton}
            >
              <Text selectable style={styles.replaceText}>重新选择照片</Text>
            </Pressable>
          </View>

          {busy ? <Text accessibilityLiveRegion="polite" selectable style={styles.progress}>正在保存照片…</Text> : null}

          {canUseTemplate ? (
            <View style={styles.templateSection}>
              <Text selectable style={styles.sectionTitle}>选择照片模板</Text>
              <PhotoTemplatePicker
                onSelect={setSelection}
                photoCount={photoCount}
                selectedTemplateId={selection}
              />
            </View>
          ) : photoCount > 3 ? (
            <Text selectable style={styles.warning}>模板仅支持 3 张及以内照片，仍可自行排版</Text>
          ) : (
            <Text selectable style={styles.hint}>请先选择照片</Text>
          )}

          {previewLayout ? (
            <View style={styles.previewSection}>
              <Text selectable style={styles.sectionTitle}>布局效果预览</Text>
              <View
                accessibilityLabel="布局效果预览"
                accessibilityRole="image"
                style={[styles.layoutPreview, { aspectRatio: previewLayout.aspectRatio }]}
              >
                {previewLayout.elements.map((element, index) => element.type === "image" ? (
                  <Image
                    accessibilityLabel={`布局效果预览照片 ${index + 1}`}
                    contentFit="cover"
                    key={element.id}
                    source={{ uri: element.uri }}
                    style={{
                      height: percent(element.height),
                      left: percent(element.x),
                      position: "absolute",
                      top: percent(element.y),
                      transform: [{ rotate: `${element.rotation}rad` }],
                      width: percent(element.width),
                    }}
                    testID={`photo-layout-preview-${element.id}`}
                  />
                ) : null)}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <Pressable
          accessibilityLabel={confirmLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: photoCount === 0 || busy }}
          disabled={photoCount === 0 || busy}
          onPress={() => onConfirm(canUseTemplate ? selection : undefined)}
          style={[styles.confirmButton, (photoCount === 0 || busy) && styles.disabled]}
        >
          <Text selectable style={styles.confirmText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1, gap: 16, paddingHorizontal: 18 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  headingCopy: { gap: 3 },
  title: { color: colors.ink, fontFamily: serifFont, fontSize: 22 },
  count: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, fontVariant: ["tabular-nums"] },
  cancelButton: { justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 8 },
  cancelText: { color: colors.accent, fontFamily: bodyFont, fontSize: 15, fontWeight: "700", textAlign: "center" },
  content: { gap: 18, paddingBottom: 18 },
  photoSelectionControls: { gap: 18 },
  selectedPhotoSection: { gap: 10 },
  thumbnailRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  thumbnail: { aspectRatio: 1, backgroundColor: colors.surface, borderRadius: 12, width: 72 },
  replaceButton: { alignItems: "center", borderColor: colors.accent, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  replaceText: { color: colors.accent, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  templateSection: { gap: 10 },
  sectionTitle: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  warning: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 21 },
  previewSection: { gap: 12 },
  layoutPreview: { alignSelf: "center", backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 12, borderWidth: 1, overflow: "hidden", width: "72%" },
  hint: { color: colors.muted, fontFamily: bodyFont, fontSize: 14 },
  progress: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, textAlign: "center" },
  confirmButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: 14, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  confirmText: { color: colors.background, fontFamily: bodyFont, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.4 },
});
