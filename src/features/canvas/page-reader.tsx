import * as React from "react";
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { CanvasPage } from "./canvas-page";
import { resolvePageTurn } from "./page-turn";
import { colors } from "../../components/ui";
import { headingFontFamily } from "../typography/fonts";
import type { StoryPage } from "../../types/memory";

const serifFont = headingFontFamily;

function clampPageIndex(index: number, pageCount: number) {
  return Math.max(0, Math.min(index, Math.max(0, pageCount - 1)));
}

function resolveRestoredIndex(pages: StoryPage[], initialPageId?: string, fallbackIndex = 0) {
  const idIndex = initialPageId ? pages.findIndex((page) => page.id === initialPageId) : -1;
  return idIndex >= 0 ? idIndex : clampPageIndex(fallbackIndex, pages.length);
}

type PageReaderLayerBufferProps = {
  current: StoryPage;
  currentIsRight: boolean;
  currentStyle?: StyleProp<ViewStyle>;
  incoming?: StoryPage;
  incomingIsRight?: boolean;
  incomingStyle?: StyleProp<ViewStyle>;
  pageHeight: number;
  pageWidth: number;
};

export function PageReaderLayerBuffer({
  current,
  currentIsRight,
  currentStyle,
  incoming,
  incomingIsRight = false,
  incomingStyle,
  pageHeight,
  pageWidth,
}: PageReaderLayerBufferProps) {
  const layers = [
    { isCurrent: true, isRight: currentIsRight, page: current, style: currentStyle },
    ...(incoming ? [{ isCurrent: false, isRight: incomingIsRight, page: incoming, style: incomingStyle }] : []),
  ];

  return layers.map(({ isCurrent, isRight, page, style }) => {
    const isCover = page.kind === "cover";
    return (
      <Animated.View
        key={page.id}
        pointerEvents={isCurrent ? "auto" : "none"}
        style={[styles.pageLayer, style]}
        testID={isCurrent ? "reader-page" : "reader-page-incoming"}
      >
        {page.layout ? (
          <CanvasPage
            height={pageHeight}
            interactive={false}
            layout={page.layout}
            pageSide={isRight ? "right" : "left"}
            width={pageWidth}
          />
        ) : (
          <View style={[styles.textPage, isCover && { backgroundColor: page.coverColor ?? "#EFE2CF" }, { height: pageHeight, width: pageWidth }]}>
            <Text selectable style={styles.pageHeadline}>{page.headline}</Text>
            <Text selectable style={styles.pageBody}>{page.body}</Text>
          </View>
        )}
      </Animated.View>
    );
  });
}

/**
 * 只读的左右滑动翻页阅读器：整页滑出后再切换，无回弹。
 * 编辑能力交给 BookCanvasEditor，这里只用于查看样本与已保存旅行册。
 */
type PageReaderProps = {
  fallbackIndex?: number;
  initialPageId?: string;
  onActivePageChange?: (cursor: { pageId: string; index: number }) => void;
  pages: StoryPage[];
};

export function PageReader({ fallbackIndex = 0, initialPageId, onActivePageChange, pages }: PageReaderProps) {
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(Math.max(width - 40, 280), 360);
  const pageHeight = (pageWidth * 4) / 3;
  const translateX = useSharedValue(0);
  const turnDir = useSharedValue(0);
  const turnGeneration = useSharedValue(0);
  const turnGenerationRef = React.useRef(turnGeneration);
  const stableTurnGeneration = turnGenerationRef.current;
  const initialIndex = resolveRestoredIndex(pages, initialPageId, fallbackIndex);
  const [activePageId, setActivePageId] = React.useState(pages[initialIndex]?.id);
  const [pending, setPending] = React.useState<{ direction: 1 | -1; generation: number; targetPageId: string } | null>(null);
  const restorationRef = React.useRef({ fallbackIndex, initialPageId });
  const activePageChangeRef = React.useRef(onActivePageChange);
  const lastReportedCursorRef = React.useRef<{ pageId: string; index: number } | undefined>(undefined);
  const pagesRef = React.useRef(pages);
  pagesRef.current = pages;
  activePageChangeRef.current = onActivePageChange;

  const activeIndex = activePageId ? pages.findIndex((page) => page.id === activePageId) : -1;
  const index = activeIndex >= 0 ? activeIndex : clampPageIndex(fallbackIndex, pages.length);

  React.useEffect(() => {
    const restorationChanged = restorationRef.current.initialPageId !== initialPageId
      || restorationRef.current.fallbackIndex !== fallbackIndex;
    restorationRef.current = { fallbackIndex, initialPageId };

    if (restorationChanged) {
      stableTurnGeneration.value += 1;
      const restoredIndex = resolveRestoredIndex(pages, initialPageId, fallbackIndex);
      setActivePageId(pages[restoredIndex]?.id);
      setPending(null);
      translateX.value = 0;
      turnDir.value = 0;
      return;
    }

    if (activeIndex < 0) {
      setActivePageId(pages[clampPageIndex(fallbackIndex, pages.length)]?.id);
    }
    if (pending && !pages.some((page) => page.id === pending.targetPageId)) {
      stableTurnGeneration.value += 1;
      setPending(null);
      translateX.value = 0;
      turnDir.value = 0;
    }
  }, [activeIndex, fallbackIndex, initialPageId, pages, pending, stableTurnGeneration, translateX, turnDir]);

  React.useEffect(() => () => {
    stableTurnGeneration.value += 1;
  }, [stableTurnGeneration]);

  React.useEffect(() => {
    const pageId = pages[index]?.id;
    if (!pageId) return;
    const cursor = { pageId, index };
    const lastCursor = lastReportedCursorRef.current;
    if (lastCursor?.pageId === cursor.pageId && lastCursor.index === cursor.index) return;
    lastReportedCursorRef.current = cursor;
    activePageChangeRef.current?.(cursor);
  }, [index, pages]);

  const commit = React.useCallback((targetPageId: string, generation: number) => {
    if (generation !== stableTurnGeneration.value) {
      return;
    }
    stableTurnGeneration.value += 1;
    if (pagesRef.current.some((page) => page.id === targetPageId)) {
      setActivePageId(targetPageId);
    }
    setPending(null);
    translateX.value = 0;
    turnDir.value = 0;
  }, [stableTurnGeneration, translateX, turnDir]);

  const pan = React.useMemo(() => Gesture.Pan()
    .enabled(pending === null)
    .activeOffsetX([-12, 12])
    .failOffsetY([-18, 18])
    .onUpdate((event) => {
      const outsideStart = (index === 0 && event.translationX > 0)
        || (index === pages.length - 1 && event.translationX < 0);
      translateX.value = outsideStart ? event.translationX * 0.22 : event.translationX;
    })
    .onFinalize((event) => {
      const decision = resolvePageTurn({
        currentIndex: index,
        pageCount: pages.length,
        pageWidth,
        translationX: event.translationX,
        velocityX: event.velocityX,
      });
      if (decision.shouldTurn && decision.direction !== 0) {
        stableTurnGeneration.value += 1;
        const generation = stableTurnGeneration.value;
        turnDir.value = decision.direction;
        const targetPageId = pages[decision.targetIndex]?.id;
        if (!targetPageId) {
          return;
        }
        runOnJS(setPending)({ direction: decision.direction, generation, targetPageId });
        translateX.value = withTiming(
          -decision.direction * pageWidth,
          { duration: 260 },
          (finished) => {
            if (finished) {
              runOnJS(commit)(targetPageId, generation);
            }
          },
        );
      } else {
        translateX.value = withTiming(0, { duration: 160 });
      }
    }), [commit, index, pageWidth, pages, pending, stableTurnGeneration, translateX, turnDir]);

  const currentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + turnDir.value * pageWidth }],
  }));

  const current = pages[index] ?? pages[0];
  const incomingIndex = pending
    ? pages.findIndex((page) => page.id === pending.targetPageId)
    : -1;
  const incoming = incomingIndex >= 0 ? pages[incomingIndex] : undefined;

  if (!current) {
    return null;
  }

  const isRightPage = index % 2 === 0;
  const incomingIsRight = incomingIndex >= 0 ? incomingIndex % 2 === 0 : false;

  return (
    <View style={styles.reader}>
      <View style={styles.counterChip}>
        <Text selectable style={styles.counter}>第 {index + 1} 页 · 共 {pages.length} 页</Text>
      </View>
      <View style={styles.stage}>
        <GestureDetector gesture={pan}>
          <View style={{ height: pageHeight, width: pageWidth }}>
            <PageReaderLayerBuffer
              current={current}
              currentIsRight={isRightPage}
              currentStyle={currentStyle}
              incoming={incoming}
              incomingIsRight={incomingIsRight}
              incomingStyle={incomingStyle}
              pageHeight={pageHeight}
              pageWidth={pageWidth}
            />
          </View>
        </GestureDetector>
      </View>
      <Text selectable style={styles.hint}>左右滑动翻页</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reader: { alignItems: "center", gap: 12 },
  counterChip: {
    backgroundColor: colors.paper,
    borderColor: colors.paperEdge,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  counter: { color: colors.warmAccent, fontSize: 12.5, fontWeight: "800" },
  stage: { alignItems: "center" },
  pageLayer: { left: 0, position: "absolute", top: 0 },
  textPage: {
    backgroundColor: colors.surface,
    borderColor: colors.paperEdge,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    justifyContent: "center",
    padding: 24,
  },
  pageHeadline: { color: colors.ink, fontFamily: serifFont, fontSize: 22, fontWeight: "800", lineHeight: 30 },
  pageBody: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  hint: { color: colors.muted, fontSize: 12.5 },
});
