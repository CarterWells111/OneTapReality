import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { canvasFrames, canvasStickers } from "./canvas-assets";
import { resolveCanvasElementGeometry, type CanvasDimensions } from "./canvas-element-geometry";
import { SelectionHandles } from "./selection-handles";
import { useResolvedFontFamily } from "../typography/font-loading-provider";
import { isMissingPhotoToken } from "../memories/photo-references";
import type { CanvasElement as CanvasElementModel } from "../../types/memory";

type ElementPatch = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontSize?: number;
};

export type CanvasElementStylePreview = {
  color?: SharedValue<string>;
  fontSize?: SharedValue<number>;
};

type CanvasElementProps = {
  canvasHeight: number;
  canvasWidth: number;
  element: CanvasElementModel;
  interactive: boolean;
  interactionZIndex?: number;
  isSelected: boolean;
  selectionContext: string | undefined;
  stylePreview?: CanvasElementStylePreview;
  onInteract?: (id: string) => void;
  onSelect: (id: string) => void;
  onTransformStart?: () => void;
  onTransformEnd?: (id: string, patch: ElementPatch) => void;
  onTransformSettled?: () => void;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

/**
 * 根据手势结束后的绝对位置和尺寸计算元素新状态。
 * 元素允许越界（部分超出画布），保留最小尺寸防止消失。
 * 对于文字元素，仅在双指捏合/旋转等整体缩放操作时同步 fontSize；
 * 角落手柄拖拽（cornerResize）只改变文本框尺寸，不改变字体大小。
 */
export function calculateCanvasTransformFromAbsolute(
  element: CanvasElementModel,
  absoluteX: number,
  absoluteY: number,
  absoluteWidth: number,
  absoluteHeight: number,
  absoluteRotation: number,
  canvasDimensions: CanvasDimensions,
  textFontScale?: number,
): ElementPatch {
  const { width: canvasWidth, height: canvasHeight } = canvasDimensions;
  const hasCanvasWidth = Number.isFinite(canvasWidth) && canvasWidth > 0;
  const hasCanvasHeight = Number.isFinite(canvasHeight) && canvasHeight > 0;
  const persistedX = clamp(finiteOr(element.x, 0), -0.95, 0.95);
  const persistedY = clamp(finiteOr(element.y, 0), -0.95, 0.95);
  const persistedWidth = clamp(finiteOr(element.width, 0.03), 0.03, 1);
  const persistedHeight = clamp(finiteOr(element.height, 0.03), 0.03, 1);
  const width = hasCanvasWidth && Number.isFinite(absoluteWidth)
    ? clamp(absoluteWidth / canvasWidth, 0.03, 1)
    : persistedWidth;
  const height = hasCanvasHeight && Number.isFinite(absoluteHeight)
    ? clamp(absoluteHeight / canvasHeight, 0.03, 1)
    : persistedHeight;
  const x = hasCanvasWidth && Number.isFinite(absoluteX)
    ? clamp(absoluteX / canvasWidth, -0.95, 0.95)
    : persistedX;
  const y = hasCanvasHeight && Number.isFinite(absoluteY)
    ? clamp(absoluteY / canvasHeight, -0.95, 0.95)
    : persistedY;
  const patch: ElementPatch = {
    x,
    y,
    width,
    height,
    rotation: finiteOr(absoluteRotation, finiteOr(element.rotation, 0)),
  };
  // 角落拖拽不改变字体大小：只拉伸文本框，文字在框内自然重排
  if (element.type === "text" && Number.isFinite(textFontScale) && Math.abs((textFontScale ?? 1) - 1) > 0.005) {
    const scaleRatio = textFontScale as number;
    if (scaleRatio > 0) {
      patch.fontSize = Math.max(8, Math.round(finiteOr(element.fontSize, 16) * scaleRatio));
    }
  }
  return patch;
}

export function finalizeCanvasGesture(started: boolean, activeGestureCount: number) {
  "worklet";
  if (!started) {
    return { activeGestureCount, shouldCommit: false };
  }
  const nextCount = Math.max(0, activeGestureCount - 1);
  return { activeGestureCount: nextCount, shouldCommit: nextCount === 0 };
}

export function nextCanvasGestureGeneration(activeGestureCount: number, generation: number) {
  "worklet";
  return activeGestureCount === 0 ? generation + 1 : generation;
}

export function shouldApplyCanvasGestureCommit(commitGeneration: number, currentGeneration: number) {
  "worklet";
  return commitGeneration === currentGeneration;
}

export function composeCanvasGestureRotation(startOffset: number, eventRotation: number) {
  "worklet";
  return startOffset + eventRotation;
}

export function composeCanvasGestureScale(startScale: number, eventScale: number) {
  "worklet";
  return startScale * eventScale;
}

export function calculateStickerTextStyle(
  element: Pick<CanvasElementModel, "width" | "height">,
  { width: canvasWidth, height: canvasHeight }: CanvasDimensions,
) {
  const scale = Math.min(element.width * canvasWidth, element.height * canvasHeight) / (canvasWidth * 0.14);
  return { fontSize: 34 * scale, lineHeight: 40 * scale };
}

/**
 * 单个画布元素组件。
 *
 * 手势架构采用「绝对定位」模型：
 * - 共享值直接驱动元素的绝对像素坐标，不依赖 React state 位置 + 偏移。
 * - 手势期间共享值是唯一位置真相来源。
 * - 提交后 React state 被动更新，useEffect 回写共享值，无视觉跳变。
 */
export function CanvasElement({
  canvasHeight,
  canvasWidth,
  element,
  interactive,
  interactionZIndex,
  isSelected,
  selectionContext,
  stylePreview,
  onInteract,
  onSelect,
  onTransformStart,
  onTransformEnd,
  onTransformSettled,
}: CanvasElementProps) {
  const lastPressAt = React.useRef<number | null>(null);
  const baseGeometry = resolveCanvasElementGeometry(element, {
    width: canvasWidth,
    height: canvasHeight,
  });

  React.useEffect(() => {
    lastPressAt.current = null;
  }, [interactive, selectionContext]);

  // ── 绝对位置共享值 ──
  const posX = useSharedValue(baseGeometry.left);
  const posY = useSharedValue(baseGeometry.top);
  const elemW = useSharedValue(baseGeometry.width);
  const elemH = useSharedValue(baseGeometry.height);
  // 手势缩放因子（共享值），确保捏合时手柄跟随
  const gestureScale = useSharedValue(1);
  const pinchStartScale = useSharedValue(1);
  const gestureRotation = useSharedValue(0);
  const baseRotation = useSharedValue(baseGeometry.rotation);
  const rotationStartOffset = useSharedValue(0);
  const gestureGeneration = useSharedValue(0);
  const pendingTextFontScale = useSharedValue(1);
  const pinchStartFontScale = useSharedValue(1);
  const activeGestureCount = useSharedValue(0);
  const panStarted = useSharedValue(false);
  const pinchStarted = useSharedValue(false);
  const rotationStarted = useSharedValue(false);
  // 文字实时缩放因子：捏合时同步驱动 fontSize，实现所见即所得
  const fontScale = useSharedValue(1);

  // 手势开始时记录起始位置，用于增量平移
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  // ── 外部 element 变化时同步共享值（例如撤销、重做、或父组件修改） ──
  // 仅在没有活跃手势时同步，避免覆盖手势中的实时位置。
  React.useEffect(() => {
    if (activeGestureCount.value > 0) return;
    posX.value = baseGeometry.left;
    posY.value = baseGeometry.top;
    elemW.value = baseGeometry.width;
    elemH.value = baseGeometry.height;
    gestureScale.value = 1;
    pinchStartScale.value = 1;
    gestureRotation.value = 0;
    baseRotation.value = baseGeometry.rotation;
    rotationStartOffset.value = 0;
    pendingTextFontScale.value = 1;
    pinchStartFontScale.value = 1;
    fontScale.value = 1;
  }, [baseGeometry.left, baseGeometry.top, baseGeometry.width, baseGeometry.height, baseGeometry.rotation,
      posX, posY, elemW, elemH, gestureScale, pinchStartScale, gestureRotation, baseRotation, rotationStartOffset,
      pendingTextFontScale, pinchStartFontScale,
      fontScale, activeGestureCount]);

  const commitTransform = (
    absoluteX: number, absoluteY: number,
    absoluteWidth: number, absoluteHeight: number,
    absoluteRotation: number,
    commitGeneration = gestureGeneration.value,
    textFontScale = 1,
  ) => {
    if (!shouldApplyCanvasGestureCommit(commitGeneration, gestureGeneration.value)) return;
    const patch = calculateCanvasTransformFromAbsolute(
      element, absoluteX, absoluteY, absoluteWidth, absoluteHeight, absoluteRotation,
      { width: canvasWidth, height: canvasHeight },
      textFontScale,
    );
    const committedGeometry = resolveCanvasElementGeometry(
      { ...element, ...patch },
      { width: canvasWidth, height: canvasHeight },
    );
    posX.value = committedGeometry.left;
    posY.value = committedGeometry.top;
    elemW.value = committedGeometry.width;
    elemH.value = committedGeometry.height;
    gestureScale.value = 1;
    pinchStartScale.value = 1;
    baseRotation.value = committedGeometry.rotation;
    gestureRotation.value = 0;
    rotationStartOffset.value = 0;
    pendingTextFontScale.value = 1;
    pinchStartFontScale.value = 1;
    fontScale.value = 1;
    onTransformEnd?.(element.id, patch);
    onTransformSettled?.();
  };

  const acknowledgeInteraction = () => onInteract?.(element.id);
  const acknowledgeTransformStart = () => onTransformStart?.();

  const beginGesture = (started: typeof panStarted) => {
    "worklet";
    started.value = true;
    gestureGeneration.value = nextCanvasGestureGeneration(activeGestureCount.value, gestureGeneration.value);
    activeGestureCount.value += 1;
    // 在首次手势开始时保存起始位置
    if (activeGestureCount.value === 1) {
      panStartX.value = posX.value;
      panStartY.value = posY.value;
      runOnJS(acknowledgeTransformStart)();
    }
    runOnJS(acknowledgeInteraction)();
  };

  const finalizeGesture = (started: typeof panStarted) => {
    "worklet";
    const completion = finalizeCanvasGesture(started.value, activeGestureCount.value);
    if (!started.value) {
      return;
    }
    started.value = false;
    activeGestureCount.value = completion.activeGestureCount;
    if (!completion.shouldCommit) {
      return;
    }
    // 读取最终绝对位置（基于共享值的当前值）
    const finalX = posX.value;
    const finalY = posY.value;
    const finalW = elemW.value * gestureScale.value;
    const finalH = elemH.value * gestureScale.value;
    const finalRot = baseRotation.value + gestureRotation.value;
    const commitGeneration = gestureGeneration.value;
    const textFontScale = pendingTextFontScale.value;
    // 不需要重置共享值 —— React 重渲染时会通过 useEffect 同步
    runOnJS(commitTransform)(finalX, finalY, finalW, finalH, finalRot, commitGeneration, textFontScale);
  };

  // ── 手势定义 ──
  const pan = Gesture.Pan()
    .withTestId(`canvas-element-pan-${element.id}`)
    .enabled(interactive && isSelected)
    .onBegin(() => beginGesture(panStarted))
    .onUpdate((event) => {
      posX.value = panStartX.value + event.translationX;
      posY.value = panStartY.value + event.translationY;
    })
    .onFinalize(() => finalizeGesture(panStarted));

  const pinch = Gesture.Pinch()
    .withTestId(`canvas-element-pinch-${element.id}`)
    .enabled(interactive && isSelected)
    .onBegin(() => {
      pinchStartScale.value = gestureScale.value;
      pinchStartFontScale.value = pendingTextFontScale.value;
      beginGesture(pinchStarted);
    })
    .onUpdate((event) => {
      gestureScale.value = composeCanvasGestureScale(pinchStartScale.value, event.scale);
      pendingTextFontScale.value = composeCanvasGestureScale(pinchStartFontScale.value, event.scale);
      // 实时驱动文字缩放，实现所见即所得的预览
      fontScale.value = pendingTextFontScale.value;
    })
    .onFinalize(() => finalizeGesture(pinchStarted));

  const rotate = Gesture.Rotation()
    .withTestId(`canvas-element-rotation-${element.id}`)
    .enabled(interactive && isSelected)
    .onBegin(() => {
      rotationStartOffset.value = gestureRotation.value;
      beginGesture(rotationStarted);
    })
    .onUpdate((event) => {
      gestureRotation.value = composeCanvasGestureRotation(rotationStartOffset.value, event.rotation);
    })
    .onFinalize(() => finalizeGesture(rotationStarted));

  // ── 动画样式：共享值直接驱动绝对位置 ──
  const animatedStyle = useAnimatedStyle(() => ({
    left: posX.value,
    top: posY.value,
    width: elemW.value * gestureScale.value,
    height: elemH.value * gestureScale.value,
    transform: [{ rotate: `${baseRotation.value + gestureRotation.value}rad` }],
    zIndex: isSelected ? finiteOr(interactionZIndex ?? baseGeometry.zIndex, baseGeometry.zIndex) : baseGeometry.zIndex,
  }));

  const handlePress = () => {
    acknowledgeInteraction();
    const now = Date.now();
    if (lastPressAt.current !== null && now - lastPressAt.current <= 320) {
      lastPressAt.current = null;
      onSelect(element.id);
      return;
    }
    lastPressAt.current = now;
  };

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={[styles.positioned, animatedStyle]} testID={`canvas-element-frame-${element.id}`}>
        <Pressable
          accessible={interactive}
          accessibilityRole={interactive ? "button" : undefined}
          accessibilityHint={interactive ? "双击以选中并编辑" : undefined}
          disabled={!interactive}
          importantForAccessibility={interactive ? "auto" : "no"}
          onPress={interactive ? handlePress : undefined}
          pointerEvents={interactive ? "auto" : "none"}
          style={styles.touchTarget}
          testID={`canvas-element-${element.id}`}>
          <View style={styles.contentContainer} testID={`canvas-element-content-${element.id}`}>
            <ElementContent
              canvasHeight={canvasHeight}
              canvasWidth={canvasWidth}
              element={element}
              fontScale={fontScale}
              stylePreview={stylePreview}
            />
          </View>
        </Pressable>
        {isSelected ? (
          <View
            pointerEvents="none"
            style={styles.selectionOverlay}
            testID={`canvas-element-selection-${element.id}`}
          />
        ) : null}
        {/* 选中时显示四角拖拽手柄 */}
        {isSelected ? (
          <SelectionHandles
            activeGestureCount={activeGestureCount}
            elemH={elemH}
            elemW={elemW}
            gestureGeneration={gestureGeneration}
            gestureScale={gestureScale}
            onHandleDragEnd={(commitGeneration) => commitTransform(
              posX.value,
              posY.value,
              elemW.value * gestureScale.value,
              elemH.value * gestureScale.value,
              baseRotation.value + gestureRotation.value,
              commitGeneration,
              pendingTextFontScale.value,
            )}
            onHandleDragStart={() => {
              acknowledgeTransformStart();
              acknowledgeInteraction();
            }}
            posX={posX}
            posY={posY}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

function ElementContent({
  canvasHeight,
  canvasWidth,
  element,
  fontScale,
  stylePreview,
}: {
  canvasHeight: number;
  canvasWidth: number;
  element: CanvasElementModel;
  fontScale?: SharedValue<number>;
  stylePreview?: CanvasElementStylePreview;
}) {
  const resolvedFontFamily = useResolvedFontFamily(
    element.type === "text" ? element.fontStyle : undefined,
  );
  if (element.type === "image") {
    return <ImageElement testID={`canvas-image-${element.id}`} uri={element.uri} />;
  }
  if (element.type === "sticker") {
    const sticker = canvasStickers.find((candidate) => candidate.id === element.stickerId);
    return sticker ? (
      <Image contentFit="contain" source={sticker.source} style={styles.image} testID={`canvas-sticker-${element.id}`} />
    ) : (
      <Text style={styles.stickerFallback}>✦</Text>
    );
  }
  if (element.type === "frame") {
    const frame = canvasFrames.find((candidate) => candidate.id === element.frameId);
    return frame ? (
      <Image contentFit="contain" source={frame.source} style={styles.image} testID={`canvas-frame-${element.id}`} />
    ) : null;
  }
  return (
    <AnimatedText
      color={element.color}
      fontFamily={resolvedFontFamily}
      fontScale={fontScale}
      fontSize={element.fontSize}
      previewColor={stylePreview?.color}
      previewFontSize={stylePreview?.fontSize}
      text={element.text}
    />
  );
}

/**
 * 照片元素：加载失败（文件已丢失/URI 失效）时显示占位，而不是静默空白。
 * 成功后不再重复检查，避免同一 URI 反复触发 onError。
 */
function ImageElement({ testID, uri }: { testID: string; uri: string }) {
  const [failed, setFailed] = React.useState(false);
  if (isMissingPhotoToken(uri) || failed) {
    return (
      <View accessibilityLabel="本地照片缺失" accessibilityRole="image" accessible style={styles.imagePlaceholder} testID={isMissingPhotoToken(uri) ? "canvas-missing-image-placeholder" : "canvas-image-placeholder"}>
        <Text style={styles.imagePlaceholderGlyph}>🖼</Text>
        <Text style={styles.imagePlaceholderText}>照片丢失</Text>
      </View>
    );
  }
  return (
    <Image
      contentFit="cover"
      onError={() => setFailed(true)}
      source={uri}
      style={styles.image}
      testID={testID}
    />
  );
}

/**
 * 文字元素组件 —— 使用共享值驱动的 fontSize，实现缩放时的实时预览。
 * 通过 useAnimatedStyle 返回 fontSize 样式，在 UI 线程直接驱动。
 */
function AnimatedText({
  color,
  fontFamily,
  fontSize,
  fontScale,
  previewColor,
  previewFontSize,
  text,
}: {
  color: string;
  fontFamily?: string;
  fontSize: number;
  fontScale?: SharedValue<number>;
  previewColor?: SharedValue<string>;
  previewFontSize?: SharedValue<number>;
  text: string;
}) {
  const animatedTextStyle = useAnimatedStyle(() => {
    const resolvedFontSize = previewFontSize?.value ?? fontSize;
    return {
      color: previewColor?.value ?? color,
      fontSize: resolvedFontSize * (fontScale?.value ?? 1),
      lineHeight: Math.round(resolvedFontSize * (fontScale?.value ?? 1) * 1.28),
    };
  });

  return (
    <Animated.Text
      style={[
        styles.text,
        { fontFamily },
        animatedTextStyle,
      ]}>
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  positioned: { position: "absolute" },
  touchTarget: { flex: 1 },
  contentContainer: { borderRadius: 8, flex: 1, overflow: "hidden" },
  selectionOverlay: {
    borderColor: "#B76545",
    borderRadius: 8,
    borderWidth: 2,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  image: { flex: 1, width: "100%" },
  text: { paddingHorizontal: 4, paddingVertical: 2 },
  stickerFallback: { fontSize: 34, lineHeight: 40, textAlign: "center" },
  imagePlaceholder: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    width: "100%",
  },
  imagePlaceholderGlyph: { fontSize: 18 },
  imagePlaceholderText: { color: "rgba(0,0,0,0.35)", fontSize: 11, fontWeight: "600" },
});
