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
import { resolveCanvasPageWidth } from "./canvas-display-metrics";
import { AddTextButton, CanvasToolbar, UndoRedoButtons } from "./canvas-toolbar";
import { ElementContextMenu } from "./element-context-menu";
import {
  addCanvasPage,
  addImageToPage,
  addStickerToPage,
  addTextToPage,
  addFrameToPage,
  applyPhotoTemplateToPage,
  clearPhotoTemplateFromPage,
  changeCanvasElementLayer,
  deleteCanvasElement,
  duplicateCanvasElement,
  pageImageUris,
  replacePagePhotos,
  setCanvasBackground,
  setCanvasCoverColor,
  setCanvasCoverImage,
  updateCanvasElement,
  type CanvasElementPatch,
} from "./editor-pages";
import {
  createEditorSaveSnapshot,
  createTransformSettleGate,
  type CanvasEditorSaveSnapshot,
  type CanvasTextStyleDraft,
} from "./editor-save-transaction";
import { PageManagerSheet } from "./page-manager-sheet";
import { PhotoLayoutSheet } from "./photo-layout-sheet";
import { MAX_PHOTOS_PER_CANVAS_PAGE } from "./auto-layout";
import { resolvePhotoTemplate } from "./photo-templates";
import { resolvePageTurn, shouldCanvasPageHandlePan } from "./page-turn";
import { useUndoHistory } from "./undo-history";
import { ColorPicker } from "../../components/ColorPicker";
import { colors } from "../../components/ui";
import { localDiagnostics } from "../diagnostics/local-diagnostics";
import type { PhotoTemplateId, StoryPage } from "../../types/memory";
import type { StagedPhotoFile } from "../memories/photo-persistence";

export type BookEditorChangeReason = "structure" | "text" | "transform";

export type BookCanvasEditorHandle = {
  prepareSave: () => Promise<CanvasEditorSaveSnapshot | null>;
  releaseSaveLock: () => void;
};

export type { CanvasEditorSaveSnapshot } from "./editor-save-transaction";

type BookCanvasEditorProps = {
  fallbackIndex?: number;
  initialPageId?: string;
  onActivePageChange?: (cursor: { pageId: string; index: number }) => void;
  onPagesChange: (pages: StoryPage[], reason: BookEditorChangeReason) => boolean | void;
  onTransformPendingChange?: (pending: boolean) => void;
  pages: StoryPage[];
  persistSelectedPhoto?: (uri: string) => Promise<string>;
  ref?: React.Ref<BookCanvasEditorHandle>;
  stageSelectedPhoto?: (uri: string) => Promise<StagedPhotoFile>;
};

type PendingPhotoLayout =
  | {
      action: "add";
      photoUris: string[];
      stagedPhotos: StagedPhotoFile[];
      selectedTemplateId?: PhotoTemplateId;
    }
  | {
      action: "edit";
      pageId: string;
      photoUris: string[];
      photosChanged: boolean;
      stagedPhotos: StagedPhotoFile[];
      selectedTemplateId?: PhotoTemplateId;
    };

const VALID_HEX_COLOR = /^#[0-9A-F]{6}$/i;
const MIN_FONT_SIZE = 2;
const MAX_FONT_SIZE = 40;
const DEFAULT_COVER_COLOR = "#EFE2CF";

function resolveCoverColor(page: StoryPage | undefined) {
  return page?.layout?.coverColor ?? page?.coverColor ?? DEFAULT_COVER_COLOR;
}

function isValidFontSize(value: number) {
  return Number.isFinite(value) && value >= MIN_FONT_SIZE && value <= MAX_FONT_SIZE;
}

function resolveInitialPageIndex(pages: StoryPage[], initialPageId?: string, fallbackIndex = 0) {
  const idIndex = initialPageId ? pages.findIndex((page) => page.id === initialPageId) : -1;
  if (idIndex >= 0) return idIndex;
  return Math.max(0, Math.min(fallbackIndex, Math.max(0, pages.length - 1)));
}

function resolveValidOpenMenuDraft({
  editingElementId,
  menuMode,
  pages,
  previewColor,
  previewFontSize,
  staged,
}: {
  editingElementId?: string;
  menuMode: "font" | "size" | "color" | null;
  pages: StoryPage[];
  previewColor: string;
  previewFontSize: number;
  staged?: CanvasTextStyleDraft;
}): CanvasTextStyleDraft | undefined {
  const elementId = staged?.elementId ?? editingElementId;
  if (!elementId) return undefined;
  const page = pages.find((candidate) => candidate.layout?.elements.some((element) => element.id === elementId));
  const element = page?.layout?.elements.find((candidate) => candidate.id === elementId);
  if (!page || element?.type !== "text") return undefined;

  const stagedMatches = staged?.pageId === page.id && staged.elementId === element.id;
  const draft: CanvasTextStyleDraft = { elementId: element.id, pageId: page.id };
  if (stagedMatches && staged?.color) {
    const color = staged.color.toUpperCase();
    if (VALID_HEX_COLOR.test(color) && color !== element.color.toUpperCase()) {
      draft.color = color;
    }
  }
  if (stagedMatches && staged?.fontSize !== undefined) {
    if (isValidFontSize(staged.fontSize) && staged.fontSize !== element.fontSize) {
      draft.fontSize = staged.fontSize;
    }
  }
  if (editingElementId === element.id && menuMode === "color" && draft.color === undefined) {
    const color = previewColor.toUpperCase();
    if (VALID_HEX_COLOR.test(color) && color !== element.color.toUpperCase()) {
      draft.color = color;
    }
  }
  if (editingElementId === element.id && menuMode === "size" && draft.fontSize === undefined) {
    if (isValidFontSize(previewFontSize) && previewFontSize !== element.fontSize) {
      draft.fontSize = previewFontSize;
    }
  }
  return draft.color !== undefined || draft.fontSize !== undefined ? draft : undefined;
}

type BookCanvasEditorLayerBufferProps = {
  current: StoryPage;
  currentCanvasProps: React.ComponentProps<typeof CanvasPage>;
  currentIsRight: boolean;
  currentStyle: React.ComponentProps<typeof Animated.View>["style"];
  incoming?: StoryPage;
  incomingIsRight?: boolean;
  incomingStyle: React.ComponentProps<typeof Animated.View>["style"];
  pageHeight: number;
  pageWidth: number;
};

export function BookCanvasEditorLayerBuffer({
  current,
  currentCanvasProps,
  currentIsRight,
  currentStyle,
  incoming,
  incomingIsRight = false,
  incomingStyle,
  pageHeight,
  pageWidth,
}: BookCanvasEditorLayerBufferProps) {
  const layers = [
    { isCurrent: true, isRight: currentIsRight, page: current, style: currentStyle },
    ...(incoming ? [{ isCurrent: false, isRight: incomingIsRight, page: incoming, style: incomingStyle }] : []),
  ];

  return layers.map(({ isCurrent, isRight, page, style }) => (
    <Animated.View
      key={page.id}
      pointerEvents={isCurrent ? "auto" : "none"}
      style={[
        styles.pageShadow,
        styles.pageLayer,
        isRight ? styles.rightPageShadow : styles.leftPageShadow,
        style,
      ]}
      testID={isCurrent ? "book-page" : "book-page-incoming"}>
      <CanvasPage
        {...(isCurrent ? currentCanvasProps : {})}
        height={pageHeight}
        interactive={isCurrent}
        layout={isCurrent ? currentCanvasProps.layout : page.layout!}
        pageSide={isRight ? "right" : "left"}
        width={pageWidth}
      />
      <View
        pointerEvents="none"
        style={[styles.spine, isRight ? styles.spineLeft : styles.spineRight]}
      />
    </Animated.View>
  ));
}

function buildCanvasId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function rollbackStagedPhotos(stagedPhotos: readonly StagedPhotoFile[]) {
  for (const staged of stagedPhotos) {
    try {
      await staged.rollback();
    } catch (error) {
      console.warn("[BookCanvasEditor] 无法清理未提交照片：", error);
    }
  }
}

function matchingPhotoTemplateId(templateId: PhotoTemplateId | undefined, photoCount: number) {
  const template = resolvePhotoTemplate(templateId);
  return template?.photoCount === photoCount ? template.id : undefined;
}

export function BookCanvasEditor({
  fallbackIndex = 0,
  initialPageId,
  onActivePageChange,
  onPagesChange,
  onTransformPendingChange,
  pages,
  persistSelectedPhoto,
  ref,
  stageSelectedPhoto,
}: BookCanvasEditorProps) {
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = resolveCanvasPageWidth(windowWidth);
  const pageHeight = (pageWidth * 4) / 3;
  const translateX = useSharedValue(0);
  const turnDir = useSharedValue(0);
  const turnGeneration = useSharedValue(0);
  const turnGenerationRef = React.useRef(turnGeneration);
  const stableTurnGeneration = turnGenerationRef.current;
  const pagePanBlocked = useSharedValue(false);
  const colorPreviewValue = useSharedValue("#000000");
  const fontSizePreviewValue = useSharedValue(16);
  const coverColorPreviewValue = useSharedValue(DEFAULT_COVER_COLOR);
  const colorPreviewRef = React.useRef(colorPreviewValue);
  const fontSizePreviewRef = React.useRef(fontSizePreviewValue);
  const coverColorPreviewRef = React.useRef(coverColorPreviewValue);
  const stableColorPreview = colorPreviewRef.current;
  const stableFontSizePreview = fontSizePreviewRef.current;
  const stableCoverColorPreview = coverColorPreviewRef.current;
  const initialPageIndex = resolveInitialPageIndex(pages, initialPageId, fallbackIndex);
  const [currentIndex, setCurrentIndex] = React.useState(initialPageIndex);
  const currentIndexRef = React.useRef(initialPageIndex);
  const activePageIdRef = React.useRef(pages[initialPageIndex]?.id);
  const activePageChangeRef = React.useRef(onActivePageChange);
  const lastReportedCursorRef = React.useRef<{ pageId: string; index: number } | undefined>(undefined);
  const pagesRef = React.useRef(pages);
  pagesRef.current = pages;
  activePageChangeRef.current = onActivePageChange;
  const [pendingTurn, setPendingTurn] = React.useState<{ direction: 1 | -1; generation: number; targetPageId: string } | null>(null);
  const [selectedElementId, setSelectedElementId] = React.useState<string>();
  const [editingElementId, setEditingElementId] = React.useState<string>(); // 编辑模式（显示上下文菜单或文字输入框）
  const editingElementIdRef = React.useRef<string | undefined>(undefined);
  const [menuMode, setMenuMode] = React.useState<"font" | "size" | "color" | null>(null); // 打开的面板；null = 文字编辑态
  const menuModeRef = React.useRef<"font" | "size" | "color" | null>(null);
  const [pendingTextId, setPendingTextId] = React.useState<string>();
  const pendingTextIdRef = React.useRef<string | undefined>(undefined);
  const pendingStyleDraftRef = React.useRef<CanvasTextStyleDraft | undefined>(undefined);
  const saveBoundaryLockedRef = React.useRef(false);
  const transformSettleGateRef = React.useRef(createTransformSettleGate());
  const [stickerCategory, setStickerCategory] = React.useState<CanvasStickerCategory>("all");
  const [assetTrayMode, setAssetTrayMode] = React.useState<"sticker" | "frame" | "background" | "cover">("sticker");
  const [managerMounted, setManagerMounted] = React.useState(false);
  const [managerVisible, setManagerVisible] = React.useState(false);
  const [pendingPhotoLayout, setPendingPhotoLayout] = React.useState<PendingPhotoLayout | null>(null);
  const pendingPhotoLayoutRef = React.useRef<PendingPhotoLayout | null>(null);
  const [photoLayoutBusy, setPhotoLayoutBusy] = React.useState(false);
  const photoLayoutBusyRef = React.useRef(false);
  const [gestureTransformPending, setGestureTransformPending] = React.useState(false);
  const [photoOperationCount, setPhotoOperationCount] = React.useState(0);
  const photoOperationGenerationsRef = React.useRef(new Set<number>());
  const transientPhotoOperationIdRef = React.useRef(0);
  const pickerGenerationRef = React.useRef(0);
  const activePickerRef = React.useRef<number | null>(null);
  const mountedRef = React.useRef(true);
  const pendingChangeCallbackRef = React.useRef(onTransformPendingChange);
  pendingChangeCallbackRef.current = onTransformPendingChange;
  const { canUndo, canRedo, pushState, undo, redo } = useUndoHistory((restoredPages) => {
    if (saveBoundaryLockedRef.current) return false;
    try {
      if (onPagesChange(restoredPages, "structure") === false) return false;
      pagesRef.current = restoredPages;
      return true;
    } catch {
      return false;
    }
  });

  const setOwnedPendingPhotoLayout = React.useCallback((next: PendingPhotoLayout | null) => {
    pendingPhotoLayoutRef.current = next;
    setPendingPhotoLayout(next);
  }, []);
  const photoLayoutTransactionPending = pendingPhotoLayout !== null || photoOperationCount > 0;
  const editorChangePending = gestureTransformPending || photoLayoutTransactionPending;

  React.useEffect(() => {
    onTransformPendingChange?.(editorChangePending);
  }, [editorChangePending, onTransformPendingChange]);

  const activePageIndex = activePageIdRef.current
    ? pages.findIndex((page) => page.id === activePageIdRef.current)
    : -1;
  const validCurrentIndex = activePageIndex >= 0
    ? activePageIndex
    : Math.min(currentIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[validCurrentIndex];
  currentIndexRef.current = validCurrentIndex;
  editingElementIdRef.current = editingElementId;
  menuModeRef.current = menuMode;
  pendingTextIdRef.current = pendingTextId;
  const currentPageId = currentPage?.id;
  if (currentPage && activePageIndex < 0) {
    activePageIdRef.current = currentPage.id;
  }

  const initializeCoverPreview = React.useCallback((page: StoryPage | undefined) => {
    stableCoverColorPreview.value = resolveCoverColor(page);
  }, [stableCoverColorPreview]);

  React.useEffect(() => {
    if (currentIndex !== validCurrentIndex) {
      setCurrentIndex(validCurrentIndex);
      setSelectedElementId(undefined);
    }
  }, [currentIndex, validCurrentIndex]);

  React.useEffect(() => {
    initializeCoverPreview(currentPage);
  }, [currentPage, currentPageId, initializeCoverPreview]);

  React.useEffect(() => {
    if (!currentPageId) {
      return;
    }
    const cursor = { pageId: currentPageId, index: validCurrentIndex };
    const lastCursor = lastReportedCursorRef.current;
    if (lastCursor?.pageId === cursor.pageId && lastCursor.index === cursor.index) {
      return;
    }
    lastReportedCursorRef.current = cursor;
    activePageChangeRef.current?.(cursor);
  }, [currentPageId, validCurrentIndex]);

  React.useEffect(() => {
    if (pendingTurn && !pages.some((page) => page.id === pendingTurn.targetPageId)) {
      stableTurnGeneration.value += 1;
      setPendingTurn(null);
      translateX.value = 0;
      turnDir.value = 0;
    }
  }, [pages, pendingTurn, stableTurnGeneration, translateX, turnDir]);

  React.useEffect(() => () => {
    mountedRef.current = false;
    pendingChangeCallbackRef.current?.(false);
    photoOperationGenerationsRef.current.clear();
    pickerGenerationRef.current += 1;
    stableTurnGeneration.value += 1;
    const pending = pendingPhotoLayoutRef.current;
    pendingPhotoLayoutRef.current = null;
    if (pending) void rollbackStagedPhotos(pending.stagedPhotos);
  }, [stableTurnGeneration]);

  React.useEffect(() => {
    const pending = pendingPhotoLayoutRef.current;
    if (pending?.action !== "edit" || pages.some((page) => page.id === pending.pageId)) return;
    pickerGenerationRef.current += 1;
    activePickerRef.current = null;
    photoLayoutBusyRef.current = false;
    setPhotoLayoutBusy(false);
    void rollbackStagedPhotos(pending.stagedPhotos).then(() => {
      if (pendingPhotoLayoutRef.current === pending) setOwnedPendingPhotoLayout(null);
    });
  }, [pages, setOwnedPendingPhotoLayout]);

  const selectedElement = currentPage?.layout?.elements.find(
    (element) => element.id === selectedElementId,
  );
  const editingElement = editingElementId
    ? currentPage?.layout?.elements.find((el) => el.id === editingElementId)
    : undefined;

  const stageTextStyleDraft = React.useCallback((
    pageId: string,
    elementId: string,
    property: "color" | "fontSize",
    value: string | number | undefined,
  ) => {
    const current = pendingStyleDraftRef.current;
    const next: CanvasTextStyleDraft = current?.pageId === pageId && current.elementId === elementId
      ? { ...current }
      : { elementId, pageId };
    if (property === "color") {
      if (typeof value === "string") next.color = value;
      else delete next.color;
    } else if (typeof value === "number") {
      next.fontSize = value;
    } else {
      delete next.fontSize;
    }
    pendingStyleDraftRef.current = next.color !== undefined || next.fontSize !== undefined
      ? next
      : undefined;
  }, []);

  const markPendingTextEdited = React.useCallback((elementId: string) => {
    if (pendingTextIdRef.current === elementId) {
      pendingTextIdRef.current = undefined;
      setPendingTextId(undefined);
    }
  }, []);

  const changePages = React.useCallback((nextPages: StoryPage[], reason: BookEditorChangeReason) => {
    if (saveBoundaryLockedRef.current && reason !== "transform") return false;
    const previousPages = pagesRef.current;
    try {
      if (onPagesChange(nextPages, reason) === false) return false;
    } catch {
      return false;
    }
    if (reason === "structure" || reason === "transform") {
      pushState(previousPages);
    }
    pagesRef.current = nextPages;
    return true;
  }, [onPagesChange, pushState]);

  React.useImperativeHandle(ref, () => ({
    async prepareSave() {
      if (saveBoundaryLockedRef.current) return null;
      saveBoundaryLockedRef.current = true;
      const settled = await transformSettleGateRef.current.wait();
      if (!settled) {
        saveBoundaryLockedRef.current = false;
        return null;
      }
      const menuDraft = resolveValidOpenMenuDraft({
        editingElementId: editingElementIdRef.current,
        menuMode: menuModeRef.current,
        pages: pagesRef.current,
        previewColor: stableColorPreview.value,
        previewFontSize: stableFontSizePreview.value,
        staged: pendingStyleDraftRef.current,
      });
      const snapshot = createEditorSaveSnapshot({
        activePageId: activePageIdRef.current,
        fallbackIndex: currentIndexRef.current,
        pages: pagesRef.current,
        styleDraft: menuDraft,
      });
      pagesRef.current = snapshot.pages;
      pendingStyleDraftRef.current = undefined;
      if (menuDraft) {
        markPendingTextEdited(menuDraft.elementId);
      }
      return snapshot;
    },
    releaseSaveLock() {
      saveBoundaryLockedRef.current = false;
    },
  }), [markPendingTextEdited, stableColorPreview, stableFontSizePreview]);

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

  const preparePickedPhoto = React.useCallback(async (uri: string): Promise<StagedPhotoFile | null> => {
    if (stageSelectedPhoto) {
      try {
        return await stageSelectedPhoto(uri);
      } catch {
        Alert.alert(
          "照片保存失败",
          "请确认照片已从 iCloud 下载，并检查照片权限和设备存储空间后重试。",
        );
        return null;
      }
    }
    const persistedUri = await persistPickedPhoto(uri);
    return persistedUri
      ? { uri: persistedUri, commit: () => undefined, rollback: async () => undefined }
      : null;
  }, [persistPickedPhoto, stageSelectedPhoto]);

  const rollbackRejectedPhoto = React.useCallback(async (photo: StagedPhotoFile) => {
    try {
      await photo.rollback();
    } catch (error) {
      console.warn("[book-canvas-editor] 无法回滚未应用的照片：", error);
    }
  }, []);

  const beginTransientPhotoOperation = React.useCallback(() => {
    const operationId = --transientPhotoOperationIdRef.current;
    photoOperationGenerationsRef.current.add(operationId);
    if (mountedRef.current) {
      setPhotoOperationCount(photoOperationGenerationsRef.current.size);
    }
    return operationId;
  }, []);

  const finishPhotoOperation = React.useCallback((generation: number) => {
    if (photoOperationGenerationsRef.current.delete(generation) && mountedRef.current) {
      setPhotoOperationCount(photoOperationGenerationsRef.current.size);
    }
    if (activePickerRef.current === generation) {
      activePickerRef.current = null;
      photoLayoutBusyRef.current = false;
      if (mountedRef.current) setPhotoLayoutBusy(false);
    }
  }, []);

  const pickAndStagePhotos = React.useCallback(async () => {
    if (activePickerRef.current !== null) return null;
    if (!stageSelectedPhoto) {
      Alert.alert("照片保存失败", "当前编辑器无法安全暂存照片，请稍后重试。");
      return null;
    }
    const generation = ++pickerGenerationRef.current;
    photoOperationGenerationsRef.current.add(generation);
    setPhotoOperationCount(photoOperationGenerationsRef.current.size);
    activePickerRef.current = generation;
    photoLayoutBusyRef.current = true;
    setPhotoLayoutBusy(true);
    const stagedPhotos: StagedPhotoFile[] = [];
    let handedOff = false;
    const isCurrent = () => mountedRef.current && pickerGenerationRef.current === generation;
    try {
      let permission: Awaited<ReturnType<typeof ImagePicker.requestMediaLibraryPermissionsAsync>>;
      try {
        permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      } catch {
        if (isCurrent()) Alert.alert("照片选择失败", "无法检查照片权限，请稍后重试。");
        return null;
      }
      if (!isCurrent()) return null;
      if (!permission.granted) {
        Alert.alert("无法访问照片", "请在系统设置中允许访问照片后重试。");
        return null;
      }

      let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          allowsMultipleSelection: true,
          mediaTypes: ["images"],
          quality: 0.8,
          selectionLimit: MAX_PHOTOS_PER_CANVAS_PAGE,
        });
      } catch {
        if (isCurrent()) Alert.alert("照片选择失败", "无法打开照片选择器，请稍后重试。");
        return null;
      }
      if (!isCurrent() || result.canceled) return null;

      const selectedAssets = result.assets.slice(0, MAX_PHOTOS_PER_CANVAS_PAGE);
      if (selectedAssets.length === 0) return null;
      for (const asset of selectedAssets) {
        let staged: StagedPhotoFile;
        try {
          staged = await stageSelectedPhoto(asset.uri);
        } catch {
          await rollbackStagedPhotos(stagedPhotos);
          if (isCurrent()) {
            Alert.alert(
              "照片保存失败",
              "请确认照片已从 iCloud 下载，并检查照片权限和设备存储空间后重试。",
            );
          }
          return null;
        }
        stagedPhotos.push(staged);
        if (!isCurrent()) {
          await rollbackStagedPhotos(stagedPhotos);
          return null;
        }
      }
      handedOff = true;
      return { generation, stagedPhotos };
    } finally {
      if (!handedOff) finishPhotoOperation(generation);
    }
  }, [finishPhotoOperation, stageSelectedPhoto]);

  const clearPendingTextFrom = React.useCallback((sourcePages: StoryPage[] = pagesRef.current) => {
    const pendingId = pendingTextIdRef.current;
    const activePageId = activePageIdRef.current;
    if (!pendingId || !activePageId) {
      return sourcePages;
    }
    pendingTextIdRef.current = undefined;
    setPendingTextId(undefined);
    if (selectedElementId === pendingId) {
      setSelectedElementId(undefined);
    }
    return deleteCanvasElement(sourcePages, activePageId, pendingId);
  }, [selectedElementId]);

  const discardPendingText = React.useCallback(() => {
    const nextPages = clearPendingTextFrom();
    if (nextPages !== pagesRef.current) {
      changePages(nextPages, "structure");
    }
    return nextPages;
  }, [changePages, clearPendingTextFrom]);

  const handleElementInteraction = React.useCallback((elementId: string) => {
    if (pendingTextIdRef.current === elementId) {
      markPendingTextEdited(elementId);
      return;
    }
    discardPendingText();
  }, [discardPendingText, markPendingTextEdited]);

  const commitTurn = React.useCallback((targetPageId: string, generation: number) => {
    if (generation !== stableTurnGeneration.value) {
      return;
    }
    stableTurnGeneration.value += 1;
    const targetIndex = pagesRef.current.findIndex((page) => page.id === targetPageId);
    if (targetIndex >= 0) {
      initializeCoverPreview(pagesRef.current[targetIndex]);
      discardPendingText();
      setSelectedElementId(undefined);
      activePageIdRef.current = targetPageId;
      currentIndexRef.current = targetIndex;
      editingElementIdRef.current = undefined;
      menuModeRef.current = null;
      setEditingElementId(undefined);
      setMenuMode(null);
      setCurrentIndex(targetIndex);
    }
    setPendingTurn(null);
    translateX.value = 0;
    turnDir.value = 0;
  }, [discardPendingText, initializeCoverPreview, stableTurnGeneration, translateX, turnDir]);

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
      const outsideStart = (validCurrentIndex === 0 && event.translationX > 0)
        || (validCurrentIndex === pages.length - 1 && event.translationX < 0);
      translateX.value = outsideStart ? event.translationX * 0.22 : event.translationX;
    })
    .onFinalize((event) => {
      if (pagePanBlocked.value) {
        pagePanBlocked.value = false;
        translateX.value = withTiming(0, { duration: 160 });
        return;
      }
      const decision = resolvePageTurn({
        currentIndex: validCurrentIndex,
        pageCount: pages.length,
        pageWidth,
        translationX: event.translationX,
        velocityX: event.velocityX,
      });
      if (decision.shouldTurn && decision.direction !== 0) {
        const targetPageId = pages[decision.targetIndex]?.id;
        if (!targetPageId) {
          return;
        }
        stableTurnGeneration.value += 1;
        const generation = stableTurnGeneration.value;
        turnDir.value = decision.direction;
        runOnJS(setPendingTurn)({ direction: decision.direction, generation, targetPageId });
        translateX.value = withTiming(
          -decision.direction * pageWidth,
          { duration: 260 },
          (finished) => {
            if (finished) {
              runOnJS(commitTurn)(targetPageId, generation);
            }
          },
        );
      } else {
        translateX.value = withTiming(0, { duration: 160 });
      }
    }), [
      commitTurn,
      validCurrentIndex,
      pageHeight,
      pagePanBlocked,
      pageWidth,
      pages,
      pendingTurn,
      selectedElement,
      stableTurnGeneration,
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
    patch: CanvasElementPatch,
    reason: BookEditorChangeReason,
  ) => {
    const activeId = activePageIdRef.current ?? currentPage.id;
    return changePages(updateCanvasElement(pagesRef.current, activeId, elementId, patch), reason);
  };

  const commitElementColor = (elementId: string, color: string) => {
    const activeId = activePageIdRef.current ?? currentPage.id;
    const activePage = pagesRef.current.find((page) => page.id === activeId);
    const element = activePage?.layout?.elements.find((candidate) => candidate.id === elementId);
    const normalizedColor = color.toUpperCase();
    if (VALID_HEX_COLOR.test(normalizedColor) && element?.type === "text") {
      if (normalizedColor === element.color.toUpperCase()) {
        stageTextStyleDraft(activeId, elementId, "color", undefined);
        localDiagnostics.emit("style_transaction_finalized", {
          elementId,
          outcome: "no_op",
          pageId: activeId,
          property: "color",
        });
        return;
      }
      markPendingTextEdited(elementId);
      if (!updateElement(elementId, { color: normalizedColor }, "structure")) return;
      stageTextStyleDraft(activeId, elementId, "color", undefined);
      localDiagnostics.emit("style_transaction_finalized", {
        elementId,
        outcome: "commit",
        pageId: activeId,
        property: "color",
      });
      return;
    }
    stageTextStyleDraft(activeId, elementId, "color", undefined);
    stableColorPreview.value = element?.type === "text" ? element.color : "#000000";
    localDiagnostics.emit("style_transaction_finalized", {
      elementId,
      outcome: "cancel",
      pageId: activeId,
      property: "color",
    });
  };

  const commitElementFontSize = (elementId: string, fontSize: number) => {
    const activeId = activePageIdRef.current ?? currentPage.id;
    const activePage = pagesRef.current.find((page) => page.id === activeId);
    const element = activePage?.layout?.elements.find((candidate) => candidate.id === elementId);
    if (isValidFontSize(fontSize) && element?.type === "text") {
      if (fontSize === element.fontSize) {
        stageTextStyleDraft(activeId, elementId, "fontSize", undefined);
        localDiagnostics.emit("style_transaction_finalized", {
          elementId,
          outcome: "no_op",
          pageId: activeId,
          property: "fontSize",
        });
        return;
      }
      markPendingTextEdited(elementId);
      if (!updateElement(elementId, { fontSize }, "structure")) return;
      stageTextStyleDraft(activeId, elementId, "fontSize", undefined);
      localDiagnostics.emit("style_transaction_finalized", {
        elementId,
        outcome: "commit",
        pageId: activeId,
        property: "fontSize",
      });
      return;
    }
    stageTextStyleDraft(activeId, elementId, "fontSize", undefined);
    stableFontSizePreview.value = element?.type === "text" ? element.fontSize : MIN_FONT_SIZE;
    localDiagnostics.emit("style_transaction_finalized", {
      elementId,
      outcome: "cancel",
      pageId: activeId,
      property: "fontSize",
    });
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
    const pageId = currentPage.id;
    const pageBeforePicker = pagesRef.current.find((page) => page.id === pageId);
    if (!pageBeforePicker || pageImageUris(pageBeforePicker).length >= MAX_PHOTOS_PER_CANVAS_PAGE) {
      Alert.alert("无法添加照片", `每页最多支持 ${MAX_PHOTOS_PER_CANVAS_PAGE} 张照片，请先移除一张后重试。`);
      return;
    }
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
      const operationId = beginTransientPhotoOperation();
      try {
        const photo = await preparePickedPhoto(result.assets[0].uri);
        if (!photo) return;
        if (!mountedRef.current) {
          await rollbackRejectedPhoto(photo);
          return;
        }
        const latestPage = pagesRef.current.find((page) => page.id === pageId);
        if (!latestPage || pageImageUris(latestPage).length >= MAX_PHOTOS_PER_CANVAS_PAGE) {
          await rollbackRejectedPhoto(photo);
          if (mountedRef.current) {
            Alert.alert("无法添加照片", `每页最多支持 ${MAX_PHOTOS_PER_CANVAS_PAGE} 张照片，请先移除一张后重试。`);
          }
          return;
        }
        const nextId = buildCanvasId("image");
        const nextPages = addImageToPage(clearPendingTextFrom(pagesRef.current), pageId, nextId, photo.uri);
        const nextPage = nextPages.find((page) => page.id === pageId);
        const referencesStagedPhoto = nextPage?.layout?.elements.some(
          (element) => element.type === "image" && element.id === nextId && element.uri === photo.uri,
        ) === true;
        if (!referencesStagedPhoto) {
          await rollbackRejectedPhoto(photo);
          if (mountedRef.current) {
            Alert.alert("无法添加照片", `每页最多支持 ${MAX_PHOTOS_PER_CANVAS_PAGE} 张照片，请先移除一张后重试。`);
          }
          return;
        }
        if (!changePages(nextPages, "structure")) {
          await rollbackRejectedPhoto(photo);
          if (mountedRef.current) {
            Alert.alert("照片未添加", "当前旅行册正在保存，照片未能添加，请稍后重试。");
          }
          return;
        }
        photo.commit();
        setSelectedElementId(nextId);
      } finally {
        finishPhotoOperation(operationId);
      }
    }
  };

  const uploadCoverPhoto = async () => {
    const pageId = currentPage.id;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const operationId = beginTransientPhotoOperation();
    try {
      const photo = await preparePickedPhoto(result.assets[0].uri);
      if (!photo) return;
      if (!mountedRef.current) {
        await rollbackRejectedPhoto(photo);
        return;
      }
      const nextPages = setCanvasCoverImage(clearPendingTextFrom(pagesRef.current), pageId, photo.uri);
      const nextPage = nextPages.find((page) => page.id === pageId);
      const referencesStagedPhoto = nextPage?.coverImage === photo.uri
        || nextPage?.layout?.coverImage === photo.uri;
      if (!referencesStagedPhoto || !changePages(nextPages, "structure")) {
        await rollbackRejectedPhoto(photo);
        return;
      }
      photo.commit();
    } finally {
      finishPhotoOperation(operationId);
    }
  };

  const requestAddPhotoPage = async () => {
    const batch = await pickAndStagePhotos();
    if (!batch) return;
    try {
      setOwnedPendingPhotoLayout({
        action: "add",
        photoUris: batch.stagedPhotos.map((photo) => photo.uri),
        stagedPhotos: batch.stagedPhotos,
      });
    } finally {
      finishPhotoOperation(batch.generation);
    }
  };

  const editPhotoLayout = () => {
    const photoUris = pageImageUris(currentPage);
    setOwnedPendingPhotoLayout({
      action: "edit",
      pageId: currentPage.id,
      photoUris,
      photosChanged: false,
      stagedPhotos: [],
      selectedTemplateId: matchingPhotoTemplateId(currentPage.layout?.photoTemplateId, photoUris.length),
    });
  };

  const replaceStagedPhotos = async () => {
    const previous = pendingPhotoLayoutRef.current;
    if (!previous) return;
    const batch = await pickAndStagePhotos();
    if (!batch) return;
    try {
      if (pendingPhotoLayoutRef.current !== previous) {
        await rollbackStagedPhotos(batch.stagedPhotos);
        return;
      }
      await rollbackStagedPhotos(previous.stagedPhotos);
      if (pendingPhotoLayoutRef.current !== previous) {
        await rollbackStagedPhotos(batch.stagedPhotos);
        return;
      }
      const photoUris = batch.stagedPhotos.map((photo) => photo.uri);
      setOwnedPendingPhotoLayout({
        ...previous,
        photoUris,
        stagedPhotos: batch.stagedPhotos,
        ...(previous.action === "edit" ? { photosChanged: true } : {}),
        selectedTemplateId: matchingPhotoTemplateId(previous.selectedTemplateId, photoUris.length),
      });
    } finally {
      finishPhotoOperation(batch.generation);
    }
  };

  const cancelPhotoLayout = async () => {
    const cleanupGeneration = ++pickerGenerationRef.current;
    photoOperationGenerationsRef.current.add(cleanupGeneration);
    setPhotoOperationCount(photoOperationGenerationsRef.current.size);
    activePickerRef.current = null;
    photoLayoutBusyRef.current = false;
    if (mountedRef.current) setPhotoLayoutBusy(false);
    const pending = pendingPhotoLayoutRef.current;
    setOwnedPendingPhotoLayout(null);
    try {
      if (pending) await rollbackStagedPhotos(pending.stagedPhotos);
    } finally {
      finishPhotoOperation(cleanupGeneration);
    }
  };

  const rejectPhotoLayoutCommit = async (pending: PendingPhotoLayout) => {
    photoLayoutBusyRef.current = true;
    setPhotoLayoutBusy(true);
    await rollbackStagedPhotos(pending.stagedPhotos);
    if (pendingPhotoLayoutRef.current === pending) setOwnedPendingPhotoLayout(null);
    photoLayoutBusyRef.current = false;
    if (mountedRef.current) {
      setPhotoLayoutBusy(false);
      Alert.alert("照片布局未应用", "当前旅行册正在保存，照片布局未能应用，请稍后重试。");
    }
  };

  const confirmPhotoLayout = async (templateId?: PhotoTemplateId) => {
    const pending = pendingPhotoLayoutRef.current;
    if (photoLayoutBusyRef.current || !pending || pending.photoUris.length === 0) return;
    const validTemplateId = matchingPhotoTemplateId(templateId, pending.photoUris.length);

    if (pending.action === "add") {
      const addedPageId = buildCanvasId("page");
      const nextPages = addCanvasPage(pages, pending.photoUris, addedPageId, validTemplateId);
      const addedIndex = nextPages.findIndex((page) => page.id === addedPageId);
      if (!changePages(nextPages, "structure")) {
        await rejectPhotoLayoutCommit(pending);
        return;
      }
      pending.stagedPhotos.forEach((photo) => photo.commit());
      if (addedIndex >= 0) {
        stableTurnGeneration.value += 1;
        setPendingTurn(null);
        translateX.value = 0;
        turnDir.value = 0;
        setSelectedElementId(undefined);
        activePageIdRef.current = addedPageId;
        setCurrentIndex(addedIndex);
      }
    } else {
      const sourcePages = clearPendingTextFrom();
      if (sourcePages.some((page) => page.id === pending.pageId)) {
        const nextPages = pending.photosChanged
          ? replacePagePhotos(
              sourcePages,
              pending.pageId,
              pending.photoUris.map((uri, index) => ({
                id: buildCanvasId(`image-${index + 1}`),
                uri,
              })),
              validTemplateId,
            )
          : validTemplateId
            ? applyPhotoTemplateToPage(sourcePages, pending.pageId, validTemplateId)
            : clearPhotoTemplateFromPage(sourcePages, pending.pageId);
        if (nextPages !== pages && !changePages(nextPages, "structure")) {
          await rejectPhotoLayoutCommit(pending);
          return;
        }
        pending.stagedPhotos.forEach((photo) => photo.commit());
        setSelectedElementId(undefined);
      } else {
        void rollbackStagedPhotos(pending.stagedPhotos);
      }
    }
    setOwnedPendingPhotoLayout(null);
  };

  const addText = () => {
    const nextId = buildCanvasId("text");
    changePages(addTextToPage(clearPendingTextFrom(), currentPage.id, nextId), "structure");
    setSelectedElementId(nextId);
    // 不再自动打开编辑输入框：用户需点击工具栏「编辑」按钮手动触发
    pendingTextIdRef.current = nextId;
    setPendingTextId(nextId);
  };

  const pickBackground = (backgroundId: (typeof canvasBackgrounds)[number]["id"] | undefined) => {
    changePages(setCanvasBackground(clearPendingTextFrom(), currentPage.id, backgroundId), "structure");
    setSelectedElementId(undefined);
  };

  const isRightPage = validCurrentIndex % 2 === 0;
  const incomingIndex = pendingTurn
    ? pages.findIndex((page) => page.id === pendingTurn.targetPageId)
    : -1;
  const incomingPage = incomingIndex >= 0 ? pages[incomingIndex] : undefined;
  const incomingIsRight = incomingIndex >= 0 ? incomingIndex % 2 === 0 : false;

  return (
    <View style={styles.editor}>
      <View style={styles.editorTopbar}>
        <View style={styles.pageIndicatorRow}>
          {/* 左侧：撤销/重做 */}
          <UndoRedoButtons
            canRedo={canRedo}
            canUndo={canUndo}
            onRedo={() => redo(pagesRef.current)}
            onUndo={() => undo(pagesRef.current)}
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
              setManagerMounted(true);
              setManagerVisible(true);
            }}
            style={styles.pageMenuButton}>
            <Text style={styles.pageMenuButtonText}>页面管理</Text>
          </Pressable>
        </View>
      </View>

      {managerMounted ? (
        <PageManagerSheet
          onChange={(nextPages) => changePages(clearPendingTextFrom(nextPages), "structure")}
          onClose={() => setManagerVisible(false)}
          onDismiss={() => setManagerMounted(false)}
          onJumpToPage={(index) => {
            stableTurnGeneration.value += 1;
            setPendingTurn(null);
            translateX.value = 0;
            turnDir.value = 0;
            const targetPage = pagesRef.current[index];
            initializeCoverPreview(targetPage);
            discardPendingText();
            setSelectedElementId(undefined);
            activePageIdRef.current = targetPage?.id;
            currentIndexRef.current = index;
            editingElementIdRef.current = undefined;
            menuModeRef.current = null;
            setEditingElementId(undefined);
            setMenuMode(null);
            setCurrentIndex(index);
          }}
          onRequestAddPage={() => {
            void requestAddPhotoPage();
          }}
          pages={pages}
          visible={managerVisible}
        />
      ) : null}

      {pendingPhotoLayout ? (
        <PhotoLayoutSheet
          action={pendingPhotoLayout.action}
          busy={photoLayoutBusy}
          onCancel={() => { void cancelPhotoLayout(); }}
          onConfirm={confirmPhotoLayout}
          onReplacePhotos={() => {
            void replaceStagedPhotos();
          }}
          photoUris={pendingPhotoLayout.photoUris}
          selectedTemplateId={pendingPhotoLayout.selectedTemplateId}
        />
      ) : null}

      <View style={styles.bookStage}>
        <GestureDetector gesture={pagePan}>
          <View style={{ height: pageHeight, width: pageWidth }}>
            <BookCanvasEditorLayerBuffer
              current={currentPage}
              currentCanvasProps={{
                onInteractElement: handleElementInteraction,
                onPressBlank: () => {
                  discardPendingText();
                  setSelectedElementId(undefined);
                  editingElementIdRef.current = undefined;
                  menuModeRef.current = null;
                  setEditingElementId(undefined);
                  setMenuMode(null);
                },
                onSelectElement: (id) => {
                  // 如果选中了不同于 pendingText 的元素，自动确认 pending 文本
                  // （仅清除 pending 标记，不删除元素），避免后续取消选中时误删除。
                  if (pendingTextIdRef.current !== undefined && id !== pendingTextIdRef.current) {
                    pendingTextIdRef.current = undefined;
                    setPendingTextId(undefined);
                  }
                  // 选中不同元素时，关闭之前的文字编辑状态
                  if (editingElementId !== id) {
                    editingElementIdRef.current = undefined;
                    menuModeRef.current = null;
                    setEditingElementId(undefined);
                    setMenuMode(null);
                  }
                  setSelectedElementId(id);
                  // 不再自动进入编辑模式：用户需点击工具栏「编辑」按钮手动触发
                },
                onTransformEnd: (elementId, patch) => {
                  handleElementInteraction(elementId);
                  markPendingTextEdited(elementId);
                  updateElement(elementId, patch, "transform");
                },
                onTransformSettled: () => {
                  const pending = transformSettleGateRef.current.end();
                  setGestureTransformPending(pending);
                },
                onTransformStart: () => {
                  transformSettleGateRef.current.begin();
                  setGestureTransformPending(true);
                },
                coverColorPreview: assetTrayMode === "cover" && currentPage.kind === "cover"
                  ? stableCoverColorPreview
                  : undefined,
                selectedElementId,
                stylePreview: editingElement?.type === "text" && menuMode === "color"
                  ? { color: stableColorPreview, elementId: editingElement.id }
                  : editingElement?.type === "text" && menuMode === "size"
                    ? { elementId: editingElement.id, fontSize: stableFontSizePreview }
                    : undefined,
                layout: currentPage.layout,
              }}
              currentIsRight={isRightPage}
              currentStyle={currentPageStyle}
              incoming={incomingPage?.layout ? incomingPage : undefined}
              incomingIsRight={incomingIsRight}
              incomingStyle={incomingPageStyle}
              pageHeight={pageHeight}
              pageWidth={pageWidth}
            />
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
              markPendingTextEdited(editingElement.id);
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
          colorPreview={stableColorPreview}
          element={editingElement}
          elementFrame={{
            x: editingElement.x * pageWidth,
            y: editingElement.y * pageHeight,
            width: editingElement.width * pageWidth,
            height: editingElement.height * pageHeight,
          }}
          onCancelColor={() => {
            localDiagnostics.emit("style_transaction_finalized", {
              elementId: editingElement.id,
              outcome: "cancel",
              pageId: currentPage.id,
              property: "color",
            });
          }}
          onColorDraftChange={(color) => {
            stageTextStyleDraft(currentPage.id, editingElement.id, "color", color);
          }}
          onCancelSize={() => {
            localDiagnostics.emit("style_transaction_finalized", {
              elementId: editingElement.id,
              outcome: "cancel",
              pageId: currentPage.id,
              property: "fontSize",
            });
          }}
          onChangeColor={(color) => commitElementColor(editingElement.id, color)}
          onChangeFont={(fontStyle) => {
            markPendingTextEdited(editingElement.id);
            updateElement(editingElement.id, { fontStyle }, "structure");
          }}
          onChangeSize={(fontSize) => commitElementFontSize(editingElement.id, fontSize)}
          onFontSizeDraftChange={(fontSize) => {
            stageTextStyleDraft(currentPage.id, editingElement.id, "fontSize", fontSize);
          }}
          onClose={() => {
            stableColorPreview.value = editingElement.color;
            stableFontSizePreview.value = editingElement.fontSize;
            menuModeRef.current = null;
            setMenuMode(null);
          }}
          fontSizePreview={stableFontSizePreview}
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
            stableColorPreview.value = selectedElement.color;
            menuModeRef.current = "color";
            editingElementIdRef.current = selectedElement.id;
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
          editingElementIdRef.current = undefined;
          menuModeRef.current = null;
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
            menuModeRef.current = null;
            editingElementIdRef.current = selectedElement.id;
            setMenuMode(null);
            setEditingElementId(selectedElement.id);
          }
        }}
        onFont={() => {
          if (selectedElement?.type === "text") {
            menuModeRef.current = "font";
            editingElementIdRef.current = selectedElement.id;
            setMenuMode("font");
            setEditingElementId(selectedElement.id);
          }
        }}
        onPickBackground={() => setAssetTrayMode("background")}
        onSize={() => {
          if (selectedElement?.type === "text") {
            stableFontSizePreview.value = selectedElement.fontSize;
            menuModeRef.current = "size";
            editingElementIdRef.current = selectedElement.id;
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
          {currentPage.kind === "photo" ? (
            <SmallButton
              active={false}
              label="照片布局"
              onPress={editPhotoLayout}
            />
          ) : null}
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
                initializeCoverPreview(currentPage);
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
              value={resolveCoverColor(currentPage)}
              onCancel={() => {
                localDiagnostics.emit("style_transaction_finalized", {
                  outcome: "cancel",
                  pageId: currentPage.id,
                  property: "coverColor",
                });
              }}
              onCommit={(hex) => {
                const normalizedColor = hex.toUpperCase();
                if (!VALID_HEX_COLOR.test(normalizedColor)) {
                  localDiagnostics.emit("style_transaction_finalized", {
                    outcome: "cancel",
                    pageId: currentPage.id,
                    property: "coverColor",
                  });
                  return;
                }
                if (normalizedColor === resolveCoverColor(currentPage).toUpperCase()) {
                  localDiagnostics.emit("style_transaction_finalized", {
                    outcome: "no_op",
                    pageId: currentPage.id,
                    property: "coverColor",
                  });
                  return;
                }
                changePages(setCanvasCoverColor(clearPendingTextFrom(), currentPage.id, normalizedColor), "structure");
                localDiagnostics.emit("style_transaction_finalized", {
                  outcome: "commit",
                  pageId: currentPage.id,
                  property: "coverColor",
                });
              }}
              previewValue={stableCoverColorPreview}
            />
            <View style={styles.coverImageRow}>
              <Pressable
                accessibilityLabel="上传封面背景图"
                accessibilityRole="button"
                onPress={uploadCoverPhoto}
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
