import * as React from "react";
import * as ImagePicker from "expo-image-picker";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  canvasBackgrounds,
  canvasFrames,
  canvasStickerCategories,
  canvasStickers,
  getCanvasStickers,
  type CanvasStickerCategory,
} from "./canvas-assets";
import { CanvasPage } from "./canvas-page";
import { AddTextButton, CanvasToolbar, UndoRedoButtons } from "./canvas-toolbar";
import { ElementContextMenu } from "./element-context-menu";
import {
  addImageToPage,
  addStickerToPage,
  addTextToPage,
  addFrameToPage,
  changeCanvasElementLayer,
  deleteCanvasElement,
  duplicateCanvasElement,
  setCanvasBackground,
  setCanvasCoverColor,
  setCanvasCoverImage,
  updateCanvasElement,
} from "./editor-pages";
import { PageManagerSheet } from "./page-manager-sheet";
import { resolvePageTurn, shouldCanvasPageHandlePan } from "./page-turn";
import { useUndoHistory } from "./undo-history";
import { ColorPicker } from "../../components/ColorPicker";
import { colors } from "../../components/ui";
import type { StoryPage } from "../../types/memory";

export type BookEditorChangeReason = "structure" | "text" | "transform";

type BookCanvasEditorProps = {
  onPagesChange: (pages: StoryPage[], reason: BookEditorChangeReason) => void;
  onTransformPendingChange?: (pending: boolean) => void;
  pages: StoryPage[];
  persistSelectedPhoto?: (uri: string) => Promise<string>;
};

function buildCanvasId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function BookCanvasEditor({
  onPagesChange,
  onTransformPendingChange,
  pages,
  persistSelectedPhoto,
}: BookCanvasEditorProps) {
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = Math.min(Math.max(windowWidth - 40, 280), 360);
  const pageHeight = (pageWidth * 4) / 3;
  const translateX = useSharedValue(0);
  const turnDir = useSharedValue(0);
  const pagePanBlocked = useSharedValue(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [pendingTurn, setPendingTurn] = React.useState<{ direction: 1 | -1; targetIndex: number } | null>(null);
  const [selectedElementId, setSelectedElementId] = React.useState<string>();
  const [editingElementId, setEditingElementId] = React.useState<string>(); // 编辑模式（显示上下文菜单或文字输入框）
  const [menuMode, setMenuMode] = React.useState<"font" | "size" | "color" | null>(null); // 打开的面板；null = 文字编辑态
  const [pendingTextId, setPendingTextId] = React.useState<string>();
  const [stickerCategory, setStickerCategory] = React.useState<CanvasStickerCategory>("all");
  const [assetTrayMode, setAssetTrayMode] = React.useState<"sticker" | "frame" | "background" | "cover">("sticker");
  const [managerOpen, setManagerOpen] = React.useState(false);
  const { canUndo, canRedo, pushState, undo, redo } = useUndoHistory((restoredPages) => {
    onPagesChange(restoredPages, "structure");
  });

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
  const editingElement = editingElementId
    ? currentPage?.layout?.elements.find((el) => el.id === editingElementId)
    : undefined;

  const changePages = React.useCallback((nextPages: StoryPage[], reason: BookEditorChangeReason) => {
    if (reason === "structure" || reason === "transform") {
      pushState(pages);
    }
    onPagesChange(nextPages, reason);
  }, [onPagesChange, pages, pushState]);

  const persistPickedPhoto = React.useCallback(async (uri: string) => {
    if (!persistSelectedPhoto) return uri;
    try {
      return await persistSelectedPhoto(uri);
    } catch {
      Alert.alert(
        "照片保存失败",
        "请确认照片已从 iCloud 下载，并检查照片权限和设备存储空间后重试。",
      );
      return null;
    }
  }, [persistSelectedPhoto]);

  const clearPendingTextFrom = React.useCallback((sourcePages: StoryPage[] = pages) => {
    if (!pendingTextId || !currentPage) {
      return sourcePages;
    }
    setPendingTextId(undefined);
    if (selectedElementId === pendingTextId) {
      setSelectedElementId(undefined);
    }
    return deleteCanvasElement(sourcePages, currentPage.id, pendingTextId);
  }, [currentPage, pages, pendingTextId, selectedElementId]);

  const discardPendingText = React.useCallback(() => {
    const nextPages = clearPendingTextFrom();
    if (nextPages !== pages) {
      changePages(nextPages, "structure");
    }
    return nextPages;
  }, [changePages, clearPendingTextFrom, pages]);

  const handleElementInteraction = React.useCallback((elementId: string) => {
    if (pendingTextId === elementId) {
      setPendingTextId(undefined);
      return;
    }
    discardPendingText();
  }, [discardPendingText, pendingTextId]);

  const commitTurn = React.useCallback((targetIndex: number) => {
    discardPendingText();
    setSelectedElementId(undefined);
    setCurrentIndex(targetIndex);
    setPendingTurn(null);
    translateX.value = 0;
    turnDir.value = 0;
  }, [discardPendingText, translateX, turnDir]);

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
    patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number; text?: string; color?: string; fontSize?: number; fontStyle?: string },
    reason: BookEditorChangeReason,
  ) => {
    changePages(updateCanvasElement(pages, currentPage.id, elementId, patch), reason);
  };

  const addSticker = (stickerId = getCanvasStickers(stickerCategory)[0]?.id ?? canvasStickers[0].id) => {
    const nextId = buildCanvasId("sticker");
    changePages(addStickerToPage(clearPendingTextFrom(), currentPage.id, nextId, stickerId), "structure");
    setSelectedElementId(nextId);
  };

  const addFrame = (frameId = canvasFrames[0]?.id) => {
    if (!frameId) {
      return;
    }
    const nextId = buildCanvasId("frame");
    changePages(addFrameToPage(clearPendingTextFrom(), currentPage.id, nextId, frameId), "structure");
    setSelectedElementId(nextId);
  };

  const addPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = await persistPickedPhoto(result.assets[0].uri);
      if (!uri) return;
      const nextId = buildCanvasId("image");
      changePages(addImageToPage(clearPendingTextFrom(), currentPage.id, nextId, uri), "structure");
      setSelectedElementId(nextId);
    }
  };

  const addText = () => {
    const nextId = buildCanvasId("text");
    changePages(addTextToPage(clearPendingTextFrom(), currentPage.id, nextId), "structure");
    setSelectedElementId(nextId);
    // 不再自动打开编辑输入框：用户需点击工具栏「编辑」按钮手动触发
    setPendingTextId(nextId);
  };

  const pickBackground = (backgroundId: (typeof canvasBackgrounds)[number]["id"] | undefined) => {
    changePages(setCanvasBackground(clearPendingTextFrom(), currentPage.id, backgroundId), "structure");
    setSelectedElementId(undefined);
  };

  const isRightPage = currentIndex % 2 === 0;
  const incomingPage = pendingTurn ? pages[pendingTurn.targetIndex] : undefined;
  const incomingIsRight = pendingTurn ? pendingTurn.targetIndex % 2 === 0 : false;

  return (
    <View style={styles.editor}>
      <View style={styles.editorTopbar}>
        <View style={styles.pageIndicatorRow}>
          {/* 左侧：撤销/重做 */}
          <UndoRedoButtons
            canRedo={canRedo}
            canUndo={canUndo}
            onRedo={() => redo(pages)}
            onUndo={() => undo(pages)}
          />
          <View style={styles.topbarSpacer} />
          {/* 右侧：页面指示器 + 页面管理 + 添加文字 */}
          <AddTextButton onPress={addText} />
          <Text style={styles.pageIndicatorText}>第 {currentIndex + 1} / {pages.length} 页</Text>
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
                  setEditingElementId(undefined);
                  setMenuMode(null);
                }}
                onSelectElement={(id) => {
                  // 如果选中了不同于 pendingText 的元素，自动确认 pending 文本
                  // （仅清除 pending 标记，不删除元素），避免后续取消选中时误删除。
                  if (pendingTextId !== undefined && id !== pendingTextId) {
                    setPendingTextId(undefined);
                  }
                  // 选中不同元素时，关闭之前的文字编辑状态
                  if (editingElementId !== id) {
                    setEditingElementId(undefined);
                    setMenuMode(null);
                  }
                  setSelectedElementId(id);
                  // 不再自动进入编辑模式：用户需点击工具栏「编辑」按钮手动触发
                }}
                onTransformEnd={(elementId, patch) => {
                  handleElementInteraction(elementId);
                  updateElement(elementId, patch, "transform");
                }}
                onTransformSettled={() => onTransformPendingChange?.(false)}
                onTransformStart={() => onTransformPendingChange?.(true)}
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

      {/* 文字输入：编辑模式下（未打开面板）显示 */}
      {menuMode === null && editingElement?.type === "text" ? (
        <View style={styles.textEditor}>
          <Text style={styles.sectionLabel}>编辑文字</Text>
          <TextInput
            accessibilityLabel="编辑选中文字"
            multiline
            onChangeText={(text) => {
              const el = currentPage?.layout?.elements.find((el) => el.id === editingElement.id);
              if (el?.type === "text" && text !== el.text && pendingTextId === editingElement.id) {
                setPendingTextId(undefined);
              }
              updateElement(editingElement.id, { text }, "text");
            }}
            style={styles.textInput}
            value={(() => {
              const el = currentPage?.layout?.elements.find((el) => el.id === editingElement.id);
              return el?.type === "text" ? el.text : "";
            })()}
          />
        </View>
      ) : null}

      {/* 上下文菜单：字体/字号/颜色面板，由工具栏按钮触发；关闭后回到文字编辑态 */}
      {menuMode !== null && editingElement?.type === "text" ? (
        <ElementContextMenu
          element={editingElement}
          elementFrame={{
            x: editingElement.x * pageWidth,
            y: editingElement.y * pageHeight,
            width: editingElement.width * pageWidth,
            height: editingElement.height * pageHeight,
          }}
          onChangeColor={(color) => updateElement(editingElement.id, { color }, "structure")}
          onChangeFont={(fontStyle) => updateElement(editingElement.id, { fontStyle }, "structure")}
          onChangeSize={(fontSize) => updateElement(editingElement.id, { fontSize }, "structure")}
          onClose={() => setMenuMode(null)}
          initialMode={menuMode}
          visible={true}
        />
      ) : null}

      <CanvasToolbar
        onAddFrame={() => {
          setAssetTrayMode("frame");
          addFrame();
        }}
        onAddSticker={addSticker}
        onAddText={addText}
        onChangeLayer={(elementId, direction) => {
          changePages(changeCanvasElementLayer(clearPendingTextFrom(), currentPage.id, elementId, direction), "structure");
        }}
        onColor={() => {
          if (selectedElement?.type === "text") {
            setMenuMode("color");
            setEditingElementId(selectedElement.id);
          }
        }}
        onDelete={(elementId) => {
          changePages(deleteCanvasElement(clearPendingTextFrom(), currentPage.id, elementId), "structure");
          setSelectedElementId(undefined);
        }}
        onDone={() => {
          discardPendingText();
          setSelectedElementId(undefined);
          setEditingElementId(undefined);
          setMenuMode(null);
        }}
        onDuplicate={(elementId) => {
          const nextId = buildCanvasId("copy");
          changePages(duplicateCanvasElement(clearPendingTextFrom(), currentPage.id, elementId, nextId), "structure");
          setSelectedElementId(nextId);
        }}
        onEdit={() => {
          // 手动触发文字编辑模式：显示 TextInput 输入框（不打开任何面板）
          if (selectedElement?.type === "text") {
            setMenuMode(null);
            setEditingElementId(selectedElement.id);
          }
        }}
        onFont={() => {
          if (selectedElement?.type === "text") {
            setMenuMode("font");
            setEditingElementId(selectedElement.id);
          }
        }}
        onPickBackground={() => setAssetTrayMode("background")}
        onSize={() => {
          if (selectedElement?.type === "text") {
            setMenuMode("size");
            setEditingElementId(selectedElement.id);
          }
        }}
        onUpdateElement={(elementId, patch) => {
          const nextPages = clearPendingTextFrom();
          changePages(updateCanvasElement(nextPages, currentPage.id, elementId, patch), "structure");
        }}
        selectedElement={selectedElement}
      />

      <View style={styles.stickerTray}>
        <View style={styles.assetModeRow}>
          <SmallButton
            active={false}
            label="📷 添加照片"
            onPress={addPhoto}
          />
          <SmallButton
            active={assetTrayMode === "sticker"}
            label="贴纸"
            onPress={() => {
              discardPendingText();
              setAssetTrayMode("sticker");
            }}
          />
          <SmallButton
            active={assetTrayMode === "frame"}
            label="相框"
            onPress={() => {
              discardPendingText();
              setAssetTrayMode("frame");
            }}
          />
          <SmallButton
            active={assetTrayMode === "background"}
            label="背景"
            onPress={() => {
              discardPendingText();
              setAssetTrayMode("background");
            }}
          />
          {currentPage.kind === "cover" ? (
            <SmallButton
              active={assetTrayMode === "cover"}
              label="封面"
              onPress={() => {
                discardPendingText();
                setAssetTrayMode("cover");
              }}
            />
          ) : null}
        </View>
        {assetTrayMode === "sticker" ? (
          <>
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
                  <Image contentFit="contain" source={sticker.source} style={styles.assetThumbnail} />
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : assetTrayMode === "frame" ? (
          <ScrollView contentContainerStyle={styles.stickerChoices} horizontal showsHorizontalScrollIndicator={false}>
            {canvasFrames.map((frame) => (
              <Pressable
                accessibilityLabel={`添加${frame.label}`}
                accessibilityRole="button"
                key={frame.id}
                onPress={() => addFrame(frame.id)}
                style={styles.frameChoice}>
                <Image contentFit="contain" source={frame.source} style={styles.assetThumbnail} />
              </Pressable>
            ))}
          </ScrollView>
        ) : assetTrayMode === "cover" ? (
          <View style={styles.coverTray}>
            <ColorPicker
              value={currentPage.coverColor ?? "#EFE2CF"}
              onChange={(hex) => {
                changePages(setCanvasCoverColor(clearPendingTextFrom(), currentPage.id, hex), "structure");
              }}
            />
            <View style={styles.coverImageRow}>
              <Pressable
                accessibilityLabel="上传封面背景图"
                accessibilityRole="button"
                onPress={async () => {
                  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (!permission.granted) {
                    return;
                  }
                  const result = await ImagePicker.launchImageLibraryAsync({
                    allowsMultipleSelection: false,
                    mediaTypes: ["images"],
                    quality: 0.8,
                  });
                  if (!result.canceled && result.assets[0]) {
                    const uri = await persistPickedPhoto(result.assets[0].uri);
                    if (!uri) return;
                    changePages(setCanvasCoverImage(clearPendingTextFrom(), currentPage.id, uri), "structure");
                  }
                }}
                style={styles.coverUploadButton}
              >
                <Text style={styles.coverUploadText}>{currentPage.coverImage ? "更换背景图" : "上传背景图"}</Text>
              </Pressable>
              {currentPage.coverImage ? (
                <Pressable
                  accessibilityLabel="移除封面背景图"
                  accessibilityRole="button"
                  onPress={() => {
                    changePages(setCanvasCoverImage(clearPendingTextFrom(), currentPage.id, undefined), "structure");
                  }}
                  style={styles.coverRemoveImage}
                >
                  <Text style={styles.coverRemoveImageText}>移除背景图</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.stickerChoices} horizontal showsHorizontalScrollIndicator={false}>
            <Pressable
              accessibilityLabel="移除背景"
              accessibilityRole="button"
              onPress={() => pickBackground(undefined)}
              style={styles.backgroundChoice}>
              <Text style={styles.clearBackgroundText}>无</Text>
            </Pressable>
            {canvasBackgrounds.map((background) => (
              <Pressable
                accessibilityLabel={`选择${background.label}`}
                accessibilityRole="button"
                key={background.id}
                onPress={() => pickBackground(background.id)}
                style={styles.backgroundChoice}>
                <Image contentFit="cover" source={background.source} style={styles.backgroundThumbnail} />
              </Pressable>
            ))}
          </ScrollView>
        )}
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
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  topbarSpacer: { flex: 1 },
  pageIndicatorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  pageIndicatorText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
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
  pageMenuButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pageMenuButtonText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
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
  assetModeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20 },
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
  frameChoice: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  backgroundChoice: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    height: 64,
    justifyContent: "center",
    overflow: "hidden",
    width: 64,
  },
  assetThumbnail: { height: "92%", width: "92%" },
  backgroundThumbnail: { height: "100%", width: "100%" },
  clearBackgroundText: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  coverTray: { gap: 14, paddingHorizontal: 20 },
  coverImageRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  coverUploadButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  coverUploadText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", textAlign: "center" },
  coverRemoveImage: { alignItems: "center", paddingVertical: 6 },
  coverRemoveImageText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
});
