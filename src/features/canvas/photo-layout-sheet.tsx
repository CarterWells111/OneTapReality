import * as React from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bodyFont, colors, serifFont } from "../../components/ui";
import type { CanvasLayout, PhotoTemplateFamilyId, PhotoTemplateId } from "../../types/memory";
import { MAX_PHOTOS_PER_CANVAS_PAGE, createPhotoLayout } from "./auto-layout";
import { CroppedImage } from "./cropped-image";
import {
  movePhotoLayoutDraftItem,
  removePhotoLayoutDraftItem,
  resolveTemplateAfterPhotoCountChange,
  type PhotoLayoutDraftItem,
} from "./photo-layout-draft";
import { PhotoCropModal } from "./photo-crop-modal";
import { PhotoTemplatePicker } from "./photo-template-picker";
import { createPhotoTemplateLayout, resolvePhotoTemplate } from "./photo-templates";

export type PhotoLayoutSheetProps = {
  action: "add" | "edit";
  busy?: boolean;
  photos?: PhotoLayoutDraftItem[];
  /** @deprecated Temporary compatibility for callers migrating to stable photo draft items. */
  photoUris?: string[];
  selectedTemplateId?: PhotoTemplateId;
  onAddPhoto?: () => void;
  onCancel: () => void;
  onConfirm: (templateId?: PhotoTemplateId) => void;
  onPhotosChange?: (photos: PhotoLayoutDraftItem[]) => void;
  /** @deprecated Replaced by onAddPhoto. */
  onReplacePhotos?: () => void;
};

const TILE_SIZE = 72;
const TILE_GAP = 10;

function matchingTemplate(templateId: PhotoTemplateId | undefined, photoCount: number) {
  const template = resolvePhotoTemplate(templateId);
  return template?.photoCount === photoCount ? template.id : undefined;
}

function photoFrameAspectRatio(index: number, layout: CanvasLayout) {
  const image = layout.elements.filter((element) => element.type === "image")[index];
  return image && image.type === "image" && image.height > 0
    ? (image.width * layout.aspectRatio) / image.height
    : 1;
}

type DraggablePhotoTileProps = {
  bottomTrashThreshold: number;
  columns: number;
  disabled: boolean;
  index: number;
  onCrop: () => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  onMove: (targetIndex: number) => void;
  onRemove: () => void;
  photo: PhotoLayoutDraftItem;
};

function DraggablePhotoTile({
  bottomTrashThreshold,
  columns,
  disabled,
  index,
  onCrop,
  onDragEnd,
  onDragStart,
  onMove,
  onRemove,
  photo,
}: DraggablePhotoTileProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    zIndex: translateX.value !== 0 || translateY.value !== 0 ? 20 : 1,
  }));
  const finishDrop = React.useCallback((x: number, y: number, absoluteY: number) => {
    if (absoluteY >= bottomTrashThreshold) {
      onRemove();
    } else {
      const columnDelta = Math.round(x / (TILE_SIZE + TILE_GAP));
      const rowDelta = Math.round(y / (TILE_SIZE + TILE_GAP));
      onMove(index + columnDelta + (rowDelta * columns));
    }
    onDragEnd();
  }, [bottomTrashThreshold, columns, index, onDragEnd, onMove, onRemove]);
  const drag = Gesture.Pan()
    .activateAfterLongPress(260)
    .enabled(!disabled)
    .withTestId(`photo-layout-drag-${photo.id}`)
    .onStart(() => runOnJS(onDragStart)())
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => runOnJS(finishDrop)(event.translationX, event.translationY, event.absoluteY))
    .onFinalize(() => {
      translateX.value = 0;
      translateY.value = 0;
      runOnJS(onDragEnd)();
    });

  return (
    <GestureDetector gesture={drag}>
      <Animated.View style={animatedStyle}>
        <Pressable
          accessibilityActions={[
            { label: "向前移动", name: "moveBackward" },
            { label: "向后移动", name: "moveForward" },
            { label: "删除", name: "delete" },
          ]}
          accessibilityLabel={`照片 ${index + 1}，点击裁剪`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "moveBackward") onMove(index - 1);
            if (event.nativeEvent.actionName === "moveForward") onMove(index + 1);
            if (event.nativeEvent.actionName === "delete") onRemove();
          }}
          onPress={onCrop}
          style={styles.thumbnailButton}
        >
          <CroppedImage crop={photo.crop} style={styles.thumbnail} testID={`photo-layout-thumbnail-${photo.id}`} uri={photo.uri} />
          <View pointerEvents="none" style={styles.photoNumberBadge}>
            <Text selectable style={styles.photoNumberText}>{index + 1}</Text>
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export function PhotoLayoutSheet({
  action,
  busy = false,
  photos,
  photoUris,
  selectedTemplateId,
  onAddPhoto,
  onCancel,
  onConfirm,
  onPhotosChange,
  onReplacePhotos,
}: PhotoLayoutSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const resolvedPhotos = React.useMemo<PhotoLayoutDraftItem[]>(
    () => photos ?? (photoUris ?? []).map((uri, index) => ({ id: `legacy-photo-${index + 1}`, uri })),
    [photoUris, photos],
  );
  const photoCount = resolvedPhotos.length;
  const familyRef = React.useRef<PhotoTemplateFamilyId | undefined>(resolvePhotoTemplate(selectedTemplateId)?.familyId);
  const selectedTemplatePropRef = React.useRef(selectedTemplateId);
  const [selection, setSelection] = React.useState<PhotoTemplateId | undefined>(() => matchingTemplate(selectedTemplateId, photoCount));
  const [cropPhotoId, setCropPhotoId] = React.useState<string>();
  const [draggingPhotoId, setDraggingPhotoId] = React.useState<string>();

  React.useEffect(() => {
    const selected = resolvePhotoTemplate(selectedTemplateId);
    if (selectedTemplatePropRef.current !== selectedTemplateId) {
      selectedTemplatePropRef.current = selectedTemplateId;
      familyRef.current = selected?.familyId;
    }
    setSelection((current) => {
      if (selected?.photoCount === photoCount && selected.familyId === familyRef.current) return selected.id;
      const currentInPreferredFamily = resolvePhotoTemplate(current)?.familyId === familyRef.current
        ? current
        : undefined;
      return resolveTemplateAfterPhotoCountChange(
        currentInPreferredFamily,
        photoCount,
        familyRef.current ?? selected?.familyId,
      );
    });
  }, [photoCount, selectedTemplateId]);

  const updateSelection = (templateId: PhotoTemplateId) => {
    familyRef.current = resolvePhotoTemplate(templateId)?.familyId;
    setSelection(templateId);
  };
  const canUseTemplate = photoCount >= 1 && photoCount <= 3;
  const previewLayout = React.useMemo(
    () => (selection
      ? createPhotoTemplateLayout(resolvedPhotos.map((photo) => photo.uri), selection)
      : photoCount > 0
        ? createPhotoLayout(resolvedPhotos.map((photo) => photo.uri))
        : null),
    [photoCount, resolvedPhotos, selection],
  );
  const cropPhoto = cropPhotoId ? resolvedPhotos.find((photo) => photo.id === cropPhotoId) : undefined;
  const cropPhotoIndex = cropPhoto ? resolvedPhotos.findIndex((photo) => photo.id === cropPhoto.id) : -1;
  const percent = (value: number) => `${Math.round(value * 10_000) / 100}%` as const;
  const confirmDisabled = busy || (action === "add" && photoCount === 0);
  const columns = Math.max(1, Math.floor((windowWidth - 36 + TILE_GAP) / (TILE_SIZE + TILE_GAP)));
  const bottomTrashThreshold = windowHeight - insets.bottom - 116;
  const confirmLabel = action === "edit" ? "应用照片与模板" : photoCount > 3 ? "创建自由排版页面" : "创建页面";

  return (
    <Modal animationType="slide" onRequestClose={onCancel} transparent={false} visible>
      <View accessibilityState={{ busy }} style={[styles.root, { paddingBottom: insets.bottom + 16, paddingTop: insets.top + 12 }]} testID="photo-layout-sheet">
        <View style={styles.header}>
          <View style={styles.headingCopy}>
            <Text selectable style={styles.title}>{action === "add" ? "新建照片页面" : "照片与模板"}</Text>
            <Text selectable style={styles.count}>{photoCount} / {MAX_PHOTOS_PER_CANVAS_PAGE} 张照片</Text>
          </View>
          <Pressable accessibilityLabel="取消照片布局" accessibilityRole="button" hitSlop={10} onPress={onCancel} style={styles.cancelButton}>
            <Text selectable style={styles.cancelText}>取消</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} testID="photo-layout-content">
          <View style={styles.selectedPhotoSection} testID="selected-photo-section">
            <Text selectable style={styles.sectionTitle}>已选择图片</Text>
            <View style={styles.thumbnailRow} testID="photo-selection-controls">
              {resolvedPhotos.map((photo, index) => (
                <DraggablePhotoTile
                  bottomTrashThreshold={bottomTrashThreshold}
                  columns={columns}
                  disabled={busy}
                  index={index}
                  key={photo.id}
                  onCrop={() => {
                    setDraggingPhotoId(undefined);
                    setCropPhotoId(photo.id);
                  }}
                  onDragEnd={() => setDraggingPhotoId(undefined)}
                  onDragStart={() => setDraggingPhotoId(photo.id)}
                  onMove={(targetIndex) => onPhotosChange?.(movePhotoLayoutDraftItem(resolvedPhotos, photo.id, targetIndex))}
                  onRemove={() => onPhotosChange?.(removePhotoLayoutDraftItem(resolvedPhotos, photo.id))}
                  photo={photo}
                />
              ))}
              <Pressable
                accessibilityHint={photoCount >= MAX_PHOTOS_PER_CANVAS_PAGE ? `每页最多 ${MAX_PHOTOS_PER_CANVAS_PAGE} 张照片` : undefined}
                accessibilityLabel="添加一张照片"
                accessibilityRole="button"
                accessibilityState={{ disabled: busy || photoCount >= MAX_PHOTOS_PER_CANVAS_PAGE }}
                disabled={busy || photoCount >= MAX_PHOTOS_PER_CANVAS_PAGE}
                onPress={onAddPhoto ?? onReplacePhotos}
                style={[styles.addTile, photoCount >= MAX_PHOTOS_PER_CANVAS_PAGE && styles.disabled]}
              >
                <Text selectable style={styles.addGlyph}>＋</Text>
              </Pressable>
            </View>
            {photoCount === 0 ? <Text selectable style={styles.hint}>当前页暂无照片，可点击＋添加。</Text> : null}
          </View>

          {busy ? <Text accessibilityLiveRegion="polite" selectable style={styles.progress}>正在保存照片…</Text> : null}
          {canUseTemplate ? (
            <View style={styles.templateSection}>
              <Text selectable style={styles.sectionTitle}>选择照片模板</Text>
              <PhotoTemplatePicker onSelect={updateSelection} photoCount={photoCount} selectedTemplateId={selection} />
            </View>
          ) : photoCount > 3 ? (
            <Text selectable style={styles.warning}>模板仅支持 3 张及以内照片，仍可自行排版</Text>
          ) : null}

          {previewLayout ? (
            <View style={styles.previewSection}>
              <Text selectable style={styles.sectionTitle}>布局效果预览</Text>
              <View accessibilityLabel="布局效果预览" accessibilityRole="image" style={[styles.layoutPreview, { aspectRatio: previewLayout.aspectRatio }]}>
                {previewLayout.elements.map((element, index) => element.type === "image" ? (
                  <CroppedImage
                    accessibilityLabel={`布局效果预览照片 ${index + 1}`}
                    crop={resolvedPhotos[index]?.crop}
                    key={element.id}
                    style={{
                      height: percent(element.height),
                      left: percent(element.x),
                      position: "absolute",
                      top: percent(element.y),
                      transform: [{ rotate: `${element.rotation}rad` }],
                      width: percent(element.width),
                    }}
                    testID={`photo-layout-preview-${element.id}`}
                    uri={element.uri}
                  />
                ) : null)}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <Pressable accessibilityLabel={confirmLabel} accessibilityRole="button" accessibilityState={{ disabled: confirmDisabled }} disabled={confirmDisabled} onPress={() => onConfirm(canUseTemplate ? selection : undefined)} style={[styles.confirmButton, confirmDisabled && styles.disabled]}>
          <Text selectable style={styles.confirmText}>{confirmLabel}</Text>
        </Pressable>

        {draggingPhotoId ? (
          <View accessibilityLabel="拖到此处删除照片" style={[styles.trashZone, { bottom: insets.bottom + 8 }]} testID="photo-layout-trash-zone">
            <Text selectable style={styles.trashGlyph}>⌫</Text>
            <Text selectable style={styles.trashText}>拖到这里删除</Text>
          </View>
        ) : null}

        {cropPhoto && previewLayout ? (
          <PhotoCropModal
            aspectRatio={photoFrameAspectRatio(cropPhotoIndex, previewLayout)}
            crop={cropPhoto.crop}
            onCancel={() => setCropPhotoId(undefined)}
            onConfirm={(nextCrop) => {
              onPhotosChange?.(resolvedPhotos.map((photo) => photo.id === cropPhoto.id ? { ...photo, crop: nextCrop } : photo));
              setCropPhotoId(undefined);
            }}
            uri={cropPhoto.uri}
          />
        ) : null}
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
  selectedPhotoSection: { gap: 10 },
  thumbnailRow: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  thumbnailButton: { borderRadius: 12, height: TILE_SIZE, overflow: "hidden", width: TILE_SIZE },
  thumbnail: { backgroundColor: colors.surface, height: TILE_SIZE, width: TILE_SIZE },
  photoNumberBadge: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.58)", borderRadius: 9, height: 18, justifyContent: "center", left: 4, position: "absolute", top: 4, width: 18 },
  photoNumberText: { color: "#FFFFFF", fontFamily: bodyFont, fontSize: 10, fontWeight: "800" },
  addTile: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 12, borderStyle: "dashed", borderWidth: 1, height: TILE_SIZE, justifyContent: "center", width: TILE_SIZE },
  addGlyph: { color: colors.muted, fontFamily: bodyFont, fontSize: 34, fontWeight: "300" },
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
  trashZone: { alignItems: "center", alignSelf: "center", backgroundColor: "rgba(130,38,28,0.94)", borderRadius: 18, gap: 4, justifyContent: "center", minHeight: 84, paddingHorizontal: 34, position: "absolute" },
  trashGlyph: { color: "#FFFFFF", fontSize: 25 },
  trashText: { color: "#FFFFFF", fontFamily: bodyFont, fontSize: 13, fontWeight: "800" },
});
