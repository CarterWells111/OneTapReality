import * as React from "react";
import {
  Modal,
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CanvasPage } from "./canvas-page";
import { resolveCanvasPreviewContentScale } from "./canvas-display-metrics";
import {
  deleteCanvasPages,
  reorderCanvasPages,
} from "./editor-pages";
import { colors } from "../../components/ui";
import type { StoryPage } from "../../types/memory";

const SHEET_PADDING = 16;
const GAP = 12;
const ROW_GAP = 14;
const LABEL_HEIGHT = 30;

type PageManagerSheetBaseProps = {
  pages: StoryPage[];
  visible?: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onJumpToPage?: (index: number) => void;
};

type PageManagerSheetProps = PageManagerSheetBaseProps & (
  | {
      mode?: "manage";
      onChange: (pages: StoryPage[]) => void;
      onDeleteAlbum?: never;
      onRequestAddPage?: () => void;
    }
  | {
      mode: "preview";
      onChange?: (pages: StoryPage[]) => void;
      onDeleteAlbum?: () => void;
      onJumpToPage: (index: number) => void;
      onRequestAddPage?: never;
    }
);

export function PageManagerSheet({
  mode = "manage",
  pages,
  onChange,
  onClose,
  onDeleteAlbum,
  onJumpToPage,
  onRequestAddPage,
  visible = true,
  onDismiss,
}: PageManagerSheetProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isPreview = mode === "preview";
  const containerWidth = width - SHEET_PADDING * 2;
  const cellWidth = (containerWidth - GAP) / 2;
  const thumbHeight = (cellWidth * 4) / 3;
  const cellHeight = thumbHeight + LABEL_HEIGHT;
  const contentScale = resolveCanvasPreviewContentScale(cellWidth, width);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const hoverRef = React.useRef<number | null>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const addRequestedRef = React.useRef(false);
  const dismissCompletedRef = React.useRef(false);
  const completeDismissal = React.useCallback(() => {
    if (dismissCompletedRef.current) return;
    dismissCompletedRef.current = true;
    if (addRequestedRef.current) {
      addRequestedRef.current = false;
      onRequestAddPage?.();
    }
    onDismiss?.();
  }, [onDismiss, onRequestAddPage]);

  React.useEffect(() => {
    if (visible) {
      dismissCompletedRef.current = false;
      return;
    }
    if (Platform.OS === "ios") return;
    const completion = InteractionManager.runAfterInteractions(completeDismissal);
    return () => completion.cancel();
  }, [completeDismissal, visible]);

  const centerOf = React.useCallback((index: number) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    return {
      x: col * (cellWidth + GAP) + cellWidth / 2,
      y: row * (cellHeight + ROW_GAP) + cellHeight / 2,
    };
  }, [cellHeight, cellWidth]);

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );
  };

  const startDrag = (index: number) => {
    hoverRef.current = index;
    setDraggingIndex(index);
    setHoverIndex(index);
  };

  const updateHover = React.useCallback((startIndex: number, translationX: number, translationY: number) => {
    const start = centerOf(startIndex);
    const pointX = start.x + translationX;
    const pointY = start.y + translationY;
    let best = startIndex;
    let bestDistance = Infinity;
    for (let index = 0; index < pages.length; index += 1) {
      const center = centerOf(index);
      const distance = (center.x - pointX) ** 2 + (center.y - pointY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    hoverRef.current = best;
    setHoverIndex(best);
  }, [centerOf, pages.length]);

  const endDrag = (startIndex: number) => {
    const target = hoverRef.current ?? startIndex;
    setDraggingIndex(null);
    setHoverIndex(null);
    hoverRef.current = null;
    if (target !== startIndex) {
      onChange?.(reorderCanvasPages(pages, startIndex, target));
    }
  };

  const addPage = () => {
    addRequestedRef.current = true;
    onClose();
  };

  const deleteSelected = () => {
    // 封面不可删除
    const safeIds = selectedIds;
    if (safeIds.length === 0) {
      return;
    }
    if (safeIds.length >= pages.length) {
      return;
    }
    onChange?.(deleteCanvasPages(pages, safeIds));
    setSelectedIds([]);
  };

  const safeIds = selectedIds;

  const draggedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: dragY.value }, { scale: draggingIndex === null ? 1 : 1.04 }],
  }));

  return (
    <Modal
      animationType="slide"
      onDismiss={completeDismissal}
      onRequestClose={onClose}
      transparent={false}
      visible={visible}>
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text selectable style={styles.title}>
            {isPreview ? `页面预览 · ${pages.length} 页` : `页面管理 · ${pages.length - 1} 页`}
          </Text>
          <Pressable
            accessibilityLabel={isPreview ? "关闭页面预览" : "完成页面管理"}
            accessibilityRole="button"
            hitSlop={{ bottom: 12, left: 12, right: 12, top: 12 }}
            onPress={onClose}
            style={styles.headerButton}>
            <Text style={styles.headerButtonText}>{isPreview ? "关闭" : "完成"}</Text>
          </Pressable>
        </View>
        <Text selectable style={styles.hint}>
          {isPreview
            ? "点击页面即可打开"
            : "长按拖动可调整顺序；点选进入多选，底部可批量操作。管理时不会编辑页面内容。"}
        </Text>

        <ScrollView contentContainerStyle={styles.gridContent}>
          <View style={styles.grid}>
            {pages.map((page, index) => {
              const actualIndex = index;
              const pageNumber = actualIndex + 1;
              const isSelected = selectedIds.includes(page.id);
              const isDragging = draggingIndex === actualIndex;
              const isHovered = hoverIndex === actualIndex && draggingIndex !== null && draggingIndex !== actualIndex;

              const cell = (
                <Animated.View
                  style={[
                    styles.cell,
                    { width: cellWidth },
                    isDragging && styles.cellDragging,
                    isDragging && draggedStyle,
                  ]}
                  testID={`page-cell-${actualIndex}`}>
                  <Pressable
                    accessibilityLabel={isPreview
                      ? `打开第 ${pageNumber} 页`
                      : `第 ${pageNumber} 页${isSelected ? "，已选中" : ""}`}
                    accessibilityRole="button"
                    accessibilityState={isPreview ? undefined : { selected: isSelected }}
                    onPress={isPreview
                      ? () => {
                          onJumpToPage?.(actualIndex);
                          onClose();
                        }
                      : () => toggleSelect(page.id)}
                    onLongPress={isPreview ? undefined : () => undefined}
                    style={[
                      styles.thumbWrap,
                      { height: thumbHeight, width: cellWidth },
                    ]}>
                    {page.layout ? (
                      <CanvasPage
                        contentScale={contentScale}
                        height={thumbHeight}
                        interactive={false}
                        layout={page.layout}
                        width={cellWidth}
                      />
                    ) : (
                      <View style={styles.thumbFallback}>
                        <Text numberOfLines={3} style={styles.thumbFallbackText}>{page.headline}</Text>
                      </View>
                    )}
                    <View
                      pointerEvents="none"
                      style={[
                        styles.thumbStateOverlay,
                        isSelected && styles.thumbSelected,
                        isHovered && styles.thumbHovered,
                      ]}
                      testID={`page-thumbnail-state-${page.id}`}
                    />
                    {!isPreview && isSelected ? (
                      <View style={styles.checkBadge}>
                        <Text style={styles.checkBadgeText}>✓</Text>
                      </View>
                    ) : null}
                  </Pressable>
                  <View style={styles.cellFooter}>
                    <Text style={styles.cellIndex}>{`第 ${pageNumber} 页`}</Text>
                    {!isPreview && onJumpToPage ? (
                      <Pressable
                        accessibilityLabel={`打开第 ${pageNumber} 页`}
                        accessibilityRole="button"
                        onPress={() => {
                          onJumpToPage(actualIndex);
                          onClose();
                        }}>
                        <Text style={styles.cellOpen}>打开</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Animated.View>
              );

              if (isPreview) {
                return <React.Fragment key={page.id}>{cell}</React.Fragment>;
              }

              const pan = Gesture.Pan()
                .activateAfterLongPress(200)
                .enabled(true)
                .onStart(() => {
                  runOnJS(startDrag)(actualIndex);
                })
                .onUpdate((event) => {
                  dragX.value = event.translationX;
                  dragY.value = event.translationY;
                  runOnJS(updateHover)(actualIndex, event.translationX, event.translationY);
                })
                .onEnd(() => {
                  runOnJS(endDrag)(actualIndex);
                })
                .onFinalize(() => {
                  dragX.value = 0;
                  dragY.value = 0;
                });

              return (
                <GestureDetector gesture={pan} key={page.id}>
                  {cell}
                </GestureDetector>
              );
            })}
          </View>
        </ScrollView>

        {isPreview && onDeleteAlbum ? (
          <View style={[styles.previewActions, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              accessibilityLabel="删除这册旅行记忆"
              accessibilityRole="button"
              onPress={onDeleteAlbum}
              style={styles.deleteAlbumButton}>
              <Text style={styles.deleteAlbumButtonText}>删除这册旅行记忆</Text>
            </Pressable>
          </View>
        ) : null}

        {isPreview ? null : (
          <View style={[styles.toolbar, { paddingBottom: insets.bottom + 16 }]}>
            {selectedIds.length > 0 ? (
              <>
                <Text style={styles.toolbarCount}>已选 {selectedIds.length} 页</Text>
                <Pressable
                  accessibilityLabel="取消选择"
                  accessibilityRole="button"
                  onPress={() => setSelectedIds([])}
                  style={styles.toolbarButton}>
                  <Text style={styles.toolbarButtonText}>取消选择</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="删除所选页面"
                  accessibilityRole="button"
                  disabled={safeIds.length >= pages.length || safeIds.length === 0}
                  onPress={deleteSelected}
                  style={[styles.toolbarButton, selectedIds.length >= pages.length && styles.toolbarButtonDisabled]}>
                  <Text style={styles.toolbarDangerText}>删除所选</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.toolbarHint}>点选页面开始多选</Text>
                <Pressable
                  accessibilityLabel="添加页面"
                  accessibilityRole="button"
                  onPress={addPage}
                  style={styles.toolbarPrimary}>
                  <Text style={styles.toolbarPrimaryText}>添加页面</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SHEET_PADDING,
    paddingTop: 18,
  },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  headerButton: { paddingHorizontal: 10, paddingVertical: 8 },
  headerButtonText: { color: colors.accent, fontSize: 15, fontWeight: "800" },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: SHEET_PADDING, paddingTop: 6 },
  gridContent: { padding: SHEET_PADDING, paddingBottom: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, rowGap: ROW_GAP },
  cell: { gap: 6 },
  cellDragging: { zIndex: 10 },
  thumbWrap: {
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  thumbStateOverlay: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 2,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  thumbSelected: { borderColor: colors.accent },
  thumbHovered: { borderColor: colors.warmAccent },
  thumbFallback: { alignItems: "center", backgroundColor: colors.surface, flex: 1, justifyContent: "center", padding: 12 },
  thumbFallbackText: { color: colors.ink, fontSize: 13, fontWeight: "700", textAlign: "center" },
  checkBadge: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: 8,
    width: 24,
  },
  checkBadgeText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  cellFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cellIndex: { color: colors.muted, fontSize: 12.5, fontWeight: "700" },
  cellOpen: { color: colors.accent, fontSize: 12.5, fontWeight: "800" },
  previewActions: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SHEET_PADDING,
    paddingTop: 12,
  },
  deleteAlbumButton: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  deleteAlbumButtonText: { color: colors.danger, fontSize: 14, fontWeight: "800" },
  toolbar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    paddingBottom: 20,
    paddingHorizontal: SHEET_PADDING,
    paddingTop: 12,
  },
  toolbarHint: { color: colors.muted, flex: 1, fontSize: 13 },
  toolbarCount: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: "800" },
  toolbarButton: { paddingHorizontal: 10, paddingVertical: 8 },
  toolbarButtonDisabled: { opacity: 0.4 },
  toolbarButtonText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  toolbarDangerText: { color: colors.danger, fontSize: 14, fontWeight: "800" },
  toolbarPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  toolbarPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
