import { Image } from "expo-image";
import * as React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import {
  canvasStickerCategories,
  canvasStickers,
  getCanvasStickers,
  type CanvasStickerCategory,
} from "./canvas-assets";
import { CanvasPage } from "./canvas-page";
import { CanvasToolbar } from "./canvas-toolbar";
import {
  addCanvasPage,
  addStickerToPage,
  addTextToPage,
  changeCanvasElementLayer,
  deleteCanvasElement,
  deleteCanvasPage,
  duplicateCanvasElement,
  moveCanvasPage,
  toggleCanvasPhotoSelection,
  updateCanvasElement,
} from "./editor-pages";
import { resolvePageTurn, shouldCanvasPageHandlePan } from "./page-turn";
import { colors } from "../../components/ui";
import type { StoryPage } from "../../types/memory";

export type BookEditorChangeReason = "structure" | "text" | "transform";

type BookCanvasEditorProps = {
  onPagesChange: (pages: StoryPage[], reason: BookEditorChangeReason) => void;
  pages: StoryPage[];
  photoUris?: string[];
};

function buildCanvasId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function BookCanvasEditor({
  onPagesChange,
  pages,
  photoUris = [],
}: BookCanvasEditorProps) {
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = Math.min(Math.max(windowWidth - 40, 280), 360);
  const pageHeight = pageWidth * 4 / 3;
  const translateX = useSharedValue(0);
  const pagePanBlocked = useSharedValue(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [selectedElementId, setSelectedElementId] = React.useState<string>();
  const [selectedPhotoUris, setSelectedPhotoUris] = React.useState<string[]>([]);
  const [stickerCategory, setStickerCategory] = React.useState<CanvasStickerCategory>("all");
  const [isPageMenuOpen, setIsPageMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (currentIndex >= pages.length) {
      setCurrentIndex(Math.max(0, pages.length - 1));
      setSelectedElementId(undefined);
    }
  }, [currentIndex, pages.length]);

  const currentPage = pages[currentIndex] ?? pages[0];
  const selectedElement = currentPage?.layout?.elements.find(
    (element) => element.id === selectedElementId,
  );
  const selectedText = selectedElement?.type === "text" ? selectedElement : undefined;

  const changePages = React.useCallback((nextPages: StoryPage[], reason: BookEditorChangeReason) => {
    onPagesChange(nextPages, reason);
  }, [onPagesChange]);

  const goToPage = React.useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= pages.length) {
      return;
    }
    setSelectedElementId(undefined);
    setCurrentIndex(nextIndex);
  }, [pages.length]);

  const pagePan = React.useMemo(() => Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-18, 18])
    .onBegin((event) => {
      pagePanBlocked.value = !shouldCanvasPageHandlePan({
        pageHeight,
        pageWidth,
        selectedElement,
        startX: event.x,
        startY: event.y,
      });
    })
    .onUpdate((event) => {
      if (pagePanBlocked.value) {
        return;
      }
      const outsideStart = (currentIndex === 0 && event.translationX > 0)
        || (currentIndex === pages.length - 1 && event.translationX < 0);
      translateX.value = outsideStart ? event.translationX * 0.22 : event.translationX;
    })
    .onFinalize((event) => {
      if (pagePanBlocked.value) {
        pagePanBlocked.value = false;
        translateX.value = withSpring(0, { damping: 18, stiffness: 190 });
        return;
      }
      const decision = resolvePageTurn({
        currentIndex,
        pageCount: pages.length,
        pageWidth,
        translationX: event.translationX,
        velocityX: event.velocityX,
      });
      translateX.value = withSpring(0, { damping: 18, stiffness: 190 });
      if (decision.shouldTurn) {
        runOnJS(goToPage)(decision.targetIndex);
      }
    }), [
      currentIndex,
      goToPage,
      pageHeight,
      pagePanBlocked,
      pageWidth,
      pages.length,
      selectedElement,
      translateX,
    ]);

  const animatedPageStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-pageWidth, 0, pageWidth],
      [7, 0, -7],
      Extrapolation.CLAMP,
    );
    const shadowOpacity = interpolate(
      Math.abs(translateX.value),
      [0, pageWidth],
      [0.16, 0.3],
      Extrapolation.CLAMP,
    );
    return {
      shadowOpacity,
      transform: [
        { perspective: 900 },
        { translateX: translateX.value },
        { rotateY: `${rotation}deg` },
      ],
    };
  });

  if (!currentPage?.layout) {
    return null;
  }

  const updateElement = (
    elementId: string,
    patch: Parameters<typeof updateCanvasElement>[3],
    reason: BookEditorChangeReason,
  ) => {
    changePages(updateCanvasElement(pages, currentPage.id, elementId, patch), reason);
  };

  const addSticker = (stickerId = getCanvasStickers(stickerCategory)[0]?.id ?? canvasStickers[0].id) => {
    const nextId = buildCanvasId("sticker");
    changePages(addStickerToPage(pages, currentPage.id, nextId, stickerId), "structure");
    setSelectedElementId(nextId);
  };

  const addText = () => {
    const nextId = buildCanvasId("text");
    changePages(addTextToPage(pages, currentPage.id, nextId), "structure");
    setSelectedElementId(nextId);
  };

  const addPage = () => {
    const nextPages = addCanvasPage(pages, selectedPhotoUris, buildCanvasId("page"));
    changePages(nextPages, "structure");
    setSelectedPhotoUris([]);
    setSelectedElementId(undefined);
    setCurrentIndex(nextPages.length - 1);
  };

  const removePage = () => {
    if (pages.length <= 1) {
      return;
    }
    const nextPages = deleteCanvasPage(pages, currentPage.id);
    changePages(nextPages, "structure");
    setSelectedElementId(undefined);
    setCurrentIndex(Math.min(currentIndex, nextPages.length - 1));
  };

  const movePage = (direction: "forward" | "backward") => {
    const targetIndex = direction === "forward" ? currentIndex + 1 : currentIndex - 1;
    const nextPages = moveCanvasPage(pages, currentPage.id, direction);
    changePages(nextPages, "structure");
    setCurrentIndex(Math.max(0, Math.min(targetIndex, nextPages.length - 1)));
  };

  const isRightPage = currentIndex % 2 === 0;

  return (
    <View style={styles.editor}>
      <View style={styles.editorTopbar}>
        <Text style={styles.currentPageLabel}>第 {currentIndex + 1} / {pages.length} 页</Text>
        <Pressable
          accessibilityLabel="打开页面管理"
          accessibilityRole="button"
          onPress={() => setIsPageMenuOpen((open) => !open)}
          style={styles.pageMenuButton}>
          <Text style={styles.pageMenuButtonText}>页面管理</Text>
        </Pressable>
      </View>

      {isPageMenuOpen ? (
        <View style={styles.pageMenu}>
          {photoUris.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>本地照片</Text>
              <ScrollView contentContainerStyle={styles.photoChoices} horizontal showsHorizontalScrollIndicator={false}>
                {photoUris.map((uri, index) => {
                  const isSelected = selectedPhotoUris.includes(uri);
                  return (
                    <Pressable
                      accessibilityLabel={`选择第 ${index + 1} 张照片`}
                      key={uri}
                      onPress={() => setSelectedPhotoUris((current) => toggleCanvasPhotoSelection(current, uri))}
                      style={[styles.photoChoice, isSelected && styles.photoChoiceSelected]}
                      testID={`canvas-photo-choice-${index}`}>
                      <Image contentFit="cover" source={uri} style={styles.photoPreview} />
                      {isSelected ? <Text style={styles.photoCheck}>已选</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}
          <View style={styles.menuActions}>
            <SmallButton label="添加页面" onPress={addPage} />
            <SmallButton
              disabled={currentIndex === 0}
              label="前移页面"
              onPress={() => movePage("backward")}
            />
            <SmallButton
              disabled={currentIndex === pages.length - 1}
              label="后移页面"
              onPress={() => movePage("forward")}
            />
            <SmallButton
              destructive
              disabled={pages.length <= 1}
              label="删除页面"
              onPress={removePage}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.bookStage}>
        <GestureDetector gesture={pagePan}>
          <Animated.View
            style={[
              styles.pageShadow,
              isRightPage ? styles.rightPageShadow : styles.leftPageShadow,
              animatedPageStyle,
            ]}
            testID="book-page">
            <CanvasPage
              height={pageHeight}
              layout={currentPage.layout}
              onPressBlank={() => setSelectedElementId(undefined)}
              onSelectElement={setSelectedElementId}
              onTransformEnd={(elementId, patch) => updateElement(elementId, patch, "transform")}
              pageSide={isRightPage ? "right" : "left"}
              selectedElementId={selectedElementId}
              width={pageWidth}
            />
            <View
              pointerEvents="none"
              style={[
                styles.spine,
                isRightPage ? styles.spineLeft : styles.spineRight,
              ]}
            />
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.indicators}>
        {pages.map((page, index) => (
          <Pressable
            accessibilityLabel={`前往第 ${index + 1} 页`}
            accessibilityRole="button"
            key={page.id}
            onPress={() => goToPage(index)}
            style={[styles.indicator, index === currentIndex && styles.indicatorActive]}
            testID="book-page-indicator">
            <Text style={[styles.indicatorText, index === currentIndex && styles.indicatorTextActive]}>
              {index + 1}
            </Text>
          </Pressable>
        ))}
      </View>

      {selectedText ? (
        <View style={styles.textEditor}>
          <Text style={styles.sectionLabel}>文字</Text>
          <TextInput
            accessibilityLabel="编辑选中文字"
            multiline
            onChangeText={(text) => updateElement(selectedText.id, { text }, "text")}
            style={styles.textInput}
            value={selectedText.text}
          />
        </View>
      ) : null}

      <CanvasToolbar
        onAddSticker={addSticker}
        onAddText={addText}
        onChangeLayer={(elementId, direction) => {
          changePages(changeCanvasElementLayer(pages, currentPage.id, elementId, direction), "structure");
        }}
        onDelete={(elementId) => {
          changePages(deleteCanvasElement(pages, currentPage.id, elementId), "structure");
          setSelectedElementId(undefined);
        }}
        onDone={() => setSelectedElementId(undefined)}
        onDuplicate={(elementId) => {
          const nextId = buildCanvasId("copy");
          changePages(duplicateCanvasElement(pages, currentPage.id, elementId, nextId), "structure");
          setSelectedElementId(nextId);
        }}
        onUpdateElement={(elementId, patch) => updateElement(elementId, patch, "structure")}
        selectedElement={selectedElement}
      />

      <View style={styles.stickerTray}>
        <ScrollView contentContainerStyle={styles.categoryRow} horizontal showsHorizontalScrollIndicator={false}>
          {canvasStickerCategories.map((category) => (
            <SmallButton
              active={category.id === stickerCategory}
              key={category.id}
              label={category.label}
              onPress={() => setStickerCategory(category.id)}
            />
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={styles.stickerChoices} horizontal showsHorizontalScrollIndicator={false}>
          {getCanvasStickers(stickerCategory).map((sticker) => (
            <Pressable
              accessibilityLabel={`添加${sticker.label}`}
              accessibilityRole="button"
              key={sticker.id}
              onPress={() => addSticker(sticker.id)}
              style={styles.stickerChoice}>
              <Text style={styles.stickerGlyph}>{sticker.glyph}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function SmallButton({
  active = false,
  destructive = false,
  disabled = false,
  label,
  onPress,
}: {
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.smallButton,
        active && styles.smallButtonActive,
        destructive && styles.smallButtonDestructive,
        disabled && styles.disabled,
      ]}>
      <Text
        style={[
          styles.smallButtonText,
          active && styles.smallButtonActiveText,
          destructive && styles.smallButtonDestructiveText,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 12 },
  editorTopbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  currentPageLabel: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  bookStage: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 6 },
  pageShadow: {
    backgroundColor: "#FFFDF7",
    elevation: 8,
    shadowColor: "#17221F",
    shadowOffset: { height: 8, width: 0 },
    shadowRadius: 16,
  },
  rightPageShadow: { borderBottomRightRadius: 18, borderTopRightRadius: 18 },
  leftPageShadow: { borderBottomLeftRadius: 18, borderTopLeftRadius: 18 },
  spine: {
    bottom: 0,
    position: "absolute",
    top: 0,
    width: 18,
  },
  spineLeft: {
    backgroundColor: "rgba(45, 45, 35, 0.08)",
    left: 0,
  },
  spineRight: {
    backgroundColor: "rgba(45, 45, 35, 0.08)",
    right: 0,
  },
  indicators: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  indicator: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    minWidth: 28,
  },
  indicatorActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  indicatorText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  indicatorTextActive: { color: "#FFFFFF" },
  pageMenuButton: { paddingHorizontal: 8, paddingVertical: 6 },
  pageMenuButtonText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  pageMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 20,
    padding: 12,
  },
  sectionLabel: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  photoChoices: { gap: 8, paddingRight: 8 },
  photoChoice: {
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 2,
    height: 64,
    overflow: "hidden",
    width: 64,
  },
  photoChoiceSelected: { borderColor: colors.accent },
  photoPreview: { height: "100%", width: "100%" },
  photoCheck: {
    backgroundColor: colors.accent,
    bottom: 0,
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    left: 0,
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: "absolute",
  },
  menuActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallButton: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  smallButtonActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  smallButtonDestructive: { borderColor: "#E6B3AA" },
  smallButtonText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  smallButtonActiveText: { color: colors.accent },
  smallButtonDestructiveText: { color: colors.danger },
  disabled: { opacity: 0.4 },
  textEditor: { gap: 7, paddingHorizontal: 20 },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    minHeight: 72,
    padding: 10,
    textAlignVertical: "top",
  },
  stickerTray: { gap: 8 },
  categoryRow: { gap: 7, paddingHorizontal: 20 },
  stickerChoices: { gap: 8, paddingHorizontal: 20 },
  stickerChoice: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  stickerGlyph: { fontSize: 24 },
});
