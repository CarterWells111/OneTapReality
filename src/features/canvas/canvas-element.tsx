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

import { canvasFonts, canvasFrames, canvasStickers } from "./canvas-assets";
import { SelectionHandles } from "./selection-handles";
import { bodyFontFamily } from "../typography/fonts";
import type { CanvasElement as CanvasElementModel } from "../../types/memory";

type ElementPatch = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontSize?: number;
};

type CanvasDimensions = { width: number; height: number };

type CanvasElementProps = {
  canvasHeight: number;
  canvasWidth: number;
  element: CanvasElementModel;
  interactive: boolean;
  isSelected: boolean;
  selectionContext: string | undefined;
  onInteract?: (id: string) => void;
  onSelect: (id: string) => void;
  onTransformEnd?: (id: string, patch: ElementPatch) => void;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

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
  cornerResize = false,
): ElementPatch {
  const { width: canvasWidth, height: canvasHeight } = canvasDimensions;
  const width = clamp(absoluteWidth / canvasWidth, 0.03, 0.95);
  const height = clamp(absoluteHeight / canvasHeight, 0.03, 0.95);
  const x = clamp(absoluteX / canvasWidth, -0.8, 0.8);
  const y = clamp(absoluteY / canvasHeight, -0.8, 0.8);
  const patch: ElementPatch = { x, y, width, height, rotation: absoluteRotation };
  // 角落拖拽不改变字体大小：只拉伸文本框，文字在框内自然重排
  if (element.type === "text" && !cornerResize) {
    const scaleRatio = absoluteWidth / (element.width * canvasWidth);
    if (Math.abs(scaleRatio - 1) > 0.005) {
      patch.fontSize = Math.max(8, Math.round((element.fontSize ?? 16) * scaleRatio));
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
  isSelected,
  selectionContext,
  onInteract,
  onSelect,
  onTransformEnd,
}: CanvasElementProps) {
  const lastPressAt = React.useRef<number | null>(null);

  React.useEffect(() => {
    lastPressAt.current = null;
  }, [selectionContext]);

  // ── 绝对位置共享值 ──
  const posX = useSharedValue(element.x * canvasWidth);
  const posY = useSharedValue(element.y * canvasHeight);
  const elemW = useSharedValue(element.width * canvasWidth);
  const elemH = useSharedValue(element.height * canvasHeight);
  // 手势缩放因子（共享值），确保捏合时手柄跟随
  const gestureScale = useSharedValue(1);
  const gestureRotation = useSharedValue(0);
  const activeGestureCount = useSharedValue(0);
  const panStarted = useSharedValue(false);
  const pinchStarted = useSharedValue(false);
  const rotationStarted = useSharedValue(false);
  // 标记当前是否是角落手柄拖拽（用于区分角落缩放和双指捏合）
  const cornerResize = useSharedValue(false);
  // 文字实时缩放因子：捏合时同步驱动 fontSize，实现所见即所得
  const fontScale = useSharedValue(1);

  // 手势开始时记录起始位置，用于增量平移
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  // ── 外部 element 变化时同步共享值（例如撤销、重做、或父组件修改） ──
  // 仅在没有活跃手势时同步，避免覆盖手势中的实时位置。
  React.useEffect(() => {
    if (activeGestureCount.value > 0) return;
    posX.value = element.x * canvasWidth;
    posY.value = element.y * canvasHeight;
    elemW.value = element.width * canvasWidth;
    elemH.value = element.height * canvasHeight;
    gestureScale.value = 1;
    gestureRotation.value = 0;
    fontScale.value = 1;
  }, [element.x, element.y, element.width, element.height, element.rotation,
      canvasWidth, canvasHeight, posX, posY, elemW, elemH, gestureScale, gestureRotation, fontScale, activeGestureCount]);

  const commitTransform = (
    absoluteX: number, absoluteY: number,
    absoluteWidth: number, absoluteHeight: number,
    absoluteRotation: number,
  ) => {
    onTransformEnd?.(element.id, calculateCanvasTransformFromAbsolute(
      element, absoluteX, absoluteY, absoluteWidth, absoluteHeight, absoluteRotation,
      { width: canvasWidth, height: canvasHeight },
      cornerResize.value,
    ));
  };

  const acknowledgeInteraction = () => onInteract?.(element.id);

  const beginGesture = (started: typeof panStarted) => {
    "worklet";
    started.value = true;
    activeGestureCount.value += 1;
    // 在首次手势开始时保存起始位置
    if (activeGestureCount.value === 1) {
      panStartX.value = posX.value;
      panStartY.value = posY.value;
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
    const finalRot = element.rotation + gestureRotation.value;
    // 不需要重置共享值 —— React 重渲染时会通过 useEffect 同步
    runOnJS(commitTransform)(finalX, finalY, finalW, finalH, finalRot);
  };

  // ── 手势定义 ──
  const pan = Gesture.Pan()
    .enabled(interactive && isSelected)
    .onBegin(() => beginGesture(panStarted))
    .onUpdate((event) => {
      posX.value = panStartX.value + event.translationX;
      posY.value = panStartY.value + event.translationY;
    })
    .onFinalize(() => finalizeGesture(panStarted));

  const pinch = Gesture.Pinch()
    .enabled(interactive && isSelected)
    .onBegin(() => beginGesture(pinchStarted))
    .onUpdate((event) => {
      gestureScale.value = event.scale;
      // 实时驱动文字缩放，实现所见即所得的预览
      fontScale.value = event.scale;
    })
    .onFinalize(() => finalizeGesture(pinchStarted));

  const rotate = Gesture.Rotation()
    .enabled(interactive && isSelected)
    .onBegin(() => beginGesture(rotationStarted))
    .onUpdate((event) => {
      gestureRotation.value = event.rotation;
    })
    .onFinalize(() => finalizeGesture(rotationStarted));

  // ── 动画样式：共享值直接驱动绝对位置 ──
  const animatedStyle = useAnimatedStyle(() => ({
    left: posX.value,
    top: posY.value,
    width: elemW.value * gestureScale.value,
    height: elemH.value * gestureScale.value,
    transform: [{ rotate: `${element.rotation + gestureRotation.value}rad` }],
  }));

  // ── 非交互模式的静态样式 ──
  const frameStyle: React.CSSProperties = {
    left: element.x * canvasWidth,
    top: element.y * canvasHeight,
    width: element.width * canvasWidth,
    height: element.height * canvasHeight,
    zIndex: element.zIndex,
  };
  const savedRotationStyle = {
    transform: [{ rotate: `${element.rotation}rad` }],
  };

  const content = <ElementContent canvasHeight={canvasHeight} canvasWidth={canvasWidth} element={element} fontScale={fontScale} />;

  if (!interactive) {
    return (
      <View
        style={[styles.positioned, frameStyle as any, savedRotationStyle as any]}
        testID={`canvas-element-${element.id}`}>
        {content}
      </View>
    );
  }

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={[styles.positioned, animatedStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="双击以选中并编辑"
          onPress={() => {
            acknowledgeInteraction();
            const now = Date.now();
            if (lastPressAt.current !== null && now - lastPressAt.current <= 320) {
              lastPressAt.current = null;
              onSelect(element.id);
              return;
            }
            lastPressAt.current = now;
          }}
          style={[styles.element, isSelected && styles.selected]}
          testID={`canvas-element-${element.id}`}>
          <ElementContent canvasHeight={canvasHeight} canvasWidth={canvasWidth} element={element} fontScale={fontScale} />
        </Pressable>
        {/* 选中时显示四角拖拽手柄 */}
        {isSelected ? (
          <SelectionHandles
            elemH={elemH}
            elemW={elemW}
            gestureScale={gestureScale}
            onHandleDragEnd={() => {
              // 拖拽结束，提交变换
              cornerResize.value = true;
              commitTransform(posX.value, posY.value, elemW.value * gestureScale.value, elemH.value * gestureScale.value, element.rotation + gestureRotation.value);
              cornerResize.value = false;
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
}: {
  canvasHeight: number;
  canvasWidth: number;
  element: CanvasElementModel;
  fontScale?: SharedValue<number>;
}) {
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
  const font = canvasFonts.find((candidate) => candidate.id === element.fontStyle);
  return (
    <AnimatedText
      color={element.color}
      fontFamily={font?.family ?? bodyFontFamily}
      fontScale={fontScale}
      fontSize={element.fontSize}
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
  if (failed) {
    return (
      <View style={styles.imagePlaceholder} testID="canvas-image-placeholder">
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
  text,
}: {
  color: string;
  fontFamily?: string;
  fontSize: number;
  fontScale?: SharedValue<number>;
  text: string;
}) {
  const animatedTextStyle = useAnimatedStyle(() => ({
    fontSize: fontSize * (fontScale?.value ?? 1),
    lineHeight: Math.round(fontSize * (fontScale?.value ?? 1) * 1.28),
  }));

  return (
    <Animated.Text
      style={[
        styles.text,
        { color, fontFamily },
        animatedTextStyle,
      ]}>
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  positioned: { position: "absolute" },
  element: { flex: 1, borderColor: "transparent", borderRadius: 8, overflow: "hidden" },
  selected: { borderColor: "#B76545", borderWidth: 2 },
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
