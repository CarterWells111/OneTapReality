import * as React from "react";
import { Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
import type { StoryPage } from "../../types/memory";

const serifFont = Platform.select({ android: "serif", default: "Georgia" });

/**
 * 只读的左右滑动翻页阅读器：整页滑出后再切换，无回弹。
 * 编辑能力交给 BookCanvasEditor，这里只用于查看样本与已保存旅行册。
 */
export function PageReader({ pages }: { pages: StoryPage[] }) {
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(Math.max(width - 40, 280), 360);
  const pageHeight = (pageWidth * 4) / 3;
  const translateX = useSharedValue(0);
  const turnDir = useSharedValue(0);
  const [index, setIndex] = React.useState(0);
  const [pending, setPending] = React.useState<{ direction: 1 | -1; targetIndex: number } | null>(null);

  React.useEffect(() => {
    if (index >= pages.length) {
      setIndex(Math.max(0, pages.length - 1));
    }
  }, [index, pages.length]);

  const commit = React.useCallback((targetIndex: number) => {
    setIndex(targetIndex);
    setPending(null);
    translateX.value = 0;
    turnDir.value = 0;
  }, [translateX, turnDir]);

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
        turnDir.value = decision.direction;
        runOnJS(setPending)({ direction: decision.direction, targetIndex: decision.targetIndex });
        translateX.value = withTiming(
          -decision.direction * pageWidth,
          { duration: 260 },
          (finished) => {
            if (finished) {
              runOnJS(commit)(decision.targetIndex);
            }
          },
        );
      } else {
        translateX.value = withTiming(0, { duration: 160 });
      }
    }), [commit, index, pageWidth, pages.length, pending, translateX, turnDir]);

  const currentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + turnDir.value * pageWidth }],
  }));

  const current = pages[index] ?? pages[0];
  const incoming = pending ? pages[pending.targetIndex] : undefined;

  if (!current) {
    return null;
  }

  const renderPage = (page: StoryPage, isRight: boolean) =>
    page.layout ? (
      <CanvasPage
        height={pageHeight}
        interactive={false}
        layout={page.layout}
        pageSide={isRight ? "right" : "left"}
        width={pageWidth}
      />
    ) : (
      <View style={[styles.textPage, { height: pageHeight, width: pageWidth }]}>
        <Text selectable style={styles.pageHeadline}>{page.headline}</Text>
        <Text selectable style={styles.pageBody}>{page.body}</Text>
      </View>
    );

  const isRightPage = index % 2 === 0;
  const incomingIsRight = pending ? pending.targetIndex % 2 === 0 : false;

  return (
    <View style={styles.reader}>
      <Text selectable style={styles.counter}>{index + 1} / {pages.length}</Text>
      <View style={styles.stage}>
        <GestureDetector gesture={pan}>
          <View style={{ height: pageHeight, width: pageWidth }}>
            <Animated.View style={[styles.pageLayer, currentStyle]} testID="reader-page">
              {renderPage(current, isRightPage)}
            </Animated.View>
            {incoming ? (
              <Animated.View pointerEvents="none" style={[styles.pageLayer, incomingStyle]}>
                {renderPage(incoming, incomingIsRight)}
              </Animated.View>
            ) : null}
          </View>
        </GestureDetector>
      </View>
      <Text selectable style={styles.hint}>左右滑动翻页</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reader: { alignItems: "center", gap: 10 },
  counter: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  stage: { alignItems: "center" },
  pageLayer: { left: 0, position: "absolute", top: 0 },
  textPage: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
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
