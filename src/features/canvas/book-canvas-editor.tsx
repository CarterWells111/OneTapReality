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
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
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
  addStickerToPage,
  addTextToPage,
  changeCanvasElementLayer,
  deleteCanvasElement,
  duplicateCanvasElement,
  updateCanvasElement,
} from "./editor-pages";
import { PageManagerSheet } from "./page-manager-sheet";
import { resolvePageTurn, shouldCanvasPageHandlePan } from "./page-turn";
import { colors } from "../../components/ui";
import type { StoryPage } from "../../types/memory";

export type BookEditorChangeReason = "structure" | "text" | "transform";

type BookCanvasEditorProps = {
  onPagesChange: (pages: StoryPage[], reason: BookEditorChangeReason) => void;
  pages: StoryPage[];
};

function buildCanvasId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function BookCanvasEditor({
  onPagesChange,
  pages,
}: BookCanvasEditorProps) {
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = Math.min(Math.max(windowWidth - 40, 280), 360);
  const pageHeight = pageWidth * 4 / 3;
  const translateX = useSharedValue(0);
  const turnDir = useSharedValue(0);
  const pagePanBlocked = useSharedValue(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [pendingTurn, setPendingTurn] = React.useState<{ direction: 1 | -1; targetIndex: number } | null>(null);
  const [selectedElementId, setSelectedElementId] = React.useState<string>();
  const [pendingTextId, setPendingTextId] = React.useState<string>();
  const [stickerCategory, setStickerCategory] = React.useState<CanvasStickerCategory>("all");
  const [managerOpen, setManagerOpen] = React.useState(false);

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

  const clearPendingTextFrom = (sourcePages: StoryPage[] = pages) => {
    if (!pendingTextId || !currentPage) {
      return sourcePages;
    }
    setPendingTextId(undefined);
    if (selectedElementId === pendingTextId) {
      setSelectedElementId(undefined);
    }
    return deleteCanvasElement(sourcePages, currentPage.id, pendingTextId);
  };

  const discardPendingText = () => {
    const nextPages = clearPendingTextFrom();
    if (nextPages !== pages) {
      changePages(nextPages, "structure");
    }
    return nextPages;
  };

  const handleElementInteraction = (elementId: string) => {
    if (pendingTextId === elementId) {
      setPendingTextId(undefined);
      return;
    }
    discardPendingText();
  };

  const commitTurn = React.useCallback((targetIndex: number) => {
    discardPendingText();
    setSelectedElementId(undefined);
    setCurrentIndex(targetIndex);
    setPendingTurn(null);
    translateX.value = 0;
    turnDir.value = 0;
  }, [translateX, turnDir]);

  const pagePan = React.useMemo(() => Gesture.Pan()
    .enabled(pendingTurn === null)
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
        translateX.value = withTiming(0, { duration: 160 });
        return;
      }
      const decision = resolvePageTurn({
        currentIndex,
        pageCount: pages.length,
        pageWidth,
        translationX: event.translationX,
        velocityX: event.velocityX,
      });
      if (decision.shouldTurn && decision.direction !== 0) {
        turnDir.value = decision.direction;
        runOnJS(setPendingTurn)({ direction: decision.direction, targetIndex: decision.targetIndex });
        translateX.value = withTiming(
          -decision.direction * pageWidth,
          { duration: 260 },
          (finished) => {
            if (finished) {
              runOnJS(commitTurn)(decision.targetIndex);
            }
          },
        );
      } else {
        translateX.value = withTiming(0, { duration: 160 });
      }
    }), [
      commitTurn,
      currentIndex,
      pageHeight,
      pagePanBlocked,
      pageWidth,
      pages.length,
      pendingTurn,
      selectedElement,
      translateX,
      turnDir,
    ]);

  const currentPageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const incomingPageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + turnDir.value * pageWidth }],
  }));

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
    changePages(addStickerToPage(clearPendingTextFrom(), currentPage.id, nextId, stickerId), "structure");
    setSelectedElementId(nextId);
  };

  const addText = () => {
    const nextId = buildCanvasId("text");
    changePages(addTextToPage(clearPendingTextFrom(), currentPage.id, nextId), "structure");
    setSelectedElementId(nextId);
    setPendingTextId(nextId);
  };

  const isRightPage = currentIndex % 2 === 0;
  const incomingPage = pendingTurn ? pages[pendingTurn.targetIndex] : undefined;
  const incomingIsRight = pendingTurn ? pendingTurn.targetIndex % 2 === 0 : false;

  return (
    <View style={styles.editor}>
      <View style={styles.editorTopbar}>
        <Text style={styles.currentPageLabel}>第 {currentIndex + 1} / {pages.length} 页</Text>
        <Pressable
          accessibilityLabel="打开页面管理"
          accessibilityRole="button"
          onPress={() => {
            discardPendingText();
            setManagerOpen(true);
          }}
          style={styles.pageMenuButton}>
          <Text style={styles.pageMenuButtonText}>页面管理</Text>
        </Pressable>
      </View>

      {managerOpen ? (
        <PageManagerSheet
          onChange={(nextPages) => changePages(clearPendingTextFrom(nextPages), "structure")}
          onClose={() => setManagerOpen(false)}
          onJumpToPage={(index) => {
            discardPendingText();
            setSelectedElementId(undefined);
            setCurrentIndex(index);
          }}
          pages={pages}
        />
      ) : null}

      <View style={styles.bookStage}>
        <GestureDetector gesture={pagePan}>
          <View style={{ height: pageHeight, width: pageWidth }}>
            <Animated.View
              style={[
                styles.pageShadow,
                styles.pageLayer,
                isRightPage ? styles.rightPageShadow : styles.leftPageShadow,
                currentPageStyle,
              ]}
              testID="book-page">
              <CanvasPage
                height={pageHeight}
                layout={currentPage.layout}
                onInteractElement={handleElementInteraction}
                onPressBlank={() => {
                  discardPendingText();
                  setSelectedElementId(undefined);
                }}
                onSelectElement={setSelectedElementId}
                onTransformEnd={(elementId, patch) => {
                  handleElementInteraction(elementId);
                  updateElement(elementId, patch, "transform");
                }}
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

            {incomingPage?.layout ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pageShadow,
                  styles.pageLayer,
                  incomingIsRight ? styles.rightPageShadow : styles.leftPageShadow,
                  incomingPageStyle,
                ]}>
                <CanvasPage
                  height={pageHeight}
                  interactive={false}
                  layout={incomingPage.layout}
                  pageSide={incomingIsRight ? "right" : "left"}
                  width={pageWidth}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.spine,
                    incomingIsRight ? styles.spineLeft : styles.spineRight,
                  ]}
                />
              </Animated.View>
            ) : null}
          </View>
        </GestureDetector>
      </View>

      {selectedText ? (
        <View style={styles.textEditor}>
          <Text style={styles.sectionLabel}>文字</Text>
          <TextInput
            accessibilityLabel="编辑选中文字"
            multiline
            onChangeText={(text) => {
              if (text !== selectedText.text && pendingTextId === selectedText.id) {
                setPendingTextId(undefined);
              }
              updateElement(selectedText.id, { text }, "text");
            }}
            style={styles.textInput}
            value={selectedText.text}
          />
        </View>
      ) : null}

      <CanvasToolbar
        onAddSticker={addSticker}
        onAddText={addText}
        onChangeLayer={(elementId, direction) => {
          changePages(changeCanvasElementLayer(clearPendingTextFrom(), currentPage.id, elementId, direction), "structure");
        }}
        onDelete={(elementId) => {
          changePages(deleteCanvasElement(clearPendingTextFrom(), currentPage.id, elementId), "structure");
          setSelectedElementId(undefined);
        }}
        onDone={() => {
          discardPendingText();
          setSelectedElementId(undefined);
        }}
        onDuplicate={(elementId) => {
          const nextId = buildCanvasId("copy");
          changePages(duplicateCanvasElement(clearPendingTextFrom(), currentPage.id, elementId, nextId), "structure");
          setSelectedElementId(nextId);
        }}
        onUpdateElement={(elementId, patch) => {
          const nextPages = clearPendingTextFrom();
          changePages(updateCanvasElement(nextPages, currentPage.id, elementId, patch), "structure");
        }}
        selectedElement={selectedElement}
      />

      <View style={styles.stickerTray}>
        <ScrollView contentContainerStyle={styles.categoryRow} horizontal showsHorizontalScrollIndicator={false}>
          {canvasStickerCategories.map((category) => (
            <SmallButton
              active={category.id === stickerCategory}
              key={category.id}
              label={category.label}
              onPress={() => {
                discardPendingText();
                setStickerCategory(category.id);
              }}
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
    shadowOpacity: 0.18,
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
  pageLayer: { left: 0, position: "absolute", top: 0 },
  pageMenuButton: { paddingHorizontal: 8, paddingVertical: 6 },
  pageMenuButtonText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  sectionLabel: { color: colors.ink, fontSize: 13, fontWeight: "800" },
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
