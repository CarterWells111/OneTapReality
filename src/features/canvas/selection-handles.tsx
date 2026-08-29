import * as React from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { StyleSheet, View } from "react-native";

/**
 * 选中元素四角 + 四边中点的手柄组件。
 * 支持自由拖拽调整元素宽高比，适用于所有元素类型（文字、图片、贴纸、相框）。
 *
 * 手柄直接操作父元素的共享值（UI 线程），因此选中框和白点始终跟随元素实时更新。
 * 不再使用自身的 translateX/translateY 动画 —— 避免与父容器位置更新产生双重偏移。
 */

export type HandleDragEndCallback = (generation: number) => void;
export type HandleDragStartCallback = () => void;

export function nextCanvasHandleGeneration(generation: number) {
  "worklet";
  return generation + 1;
}

type CornerKey = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type SelectionHandlesProps = {
  activeGestureCount: SharedValue<number>;
  /** 元素在画布上的绝对像素 X 坐标（共享值） */
  posX: SharedValue<number>;
  /** 元素在画布上的绝对像素 Y 坐标（共享值） */
  posY: SharedValue<number>;
  /** 元素像素宽度（共享值） */
  elemW: SharedValue<number>;
  /** 元素像素高度（共享值） */
  elemH: SharedValue<number>;
  /** 手势缩放因子（共享值），确保捏合时手柄跟随 */
  gestureScale: SharedValue<number>;
  gestureGeneration: SharedValue<number>;
  /** 边角拖拽结束回调 */
  onHandleDragEnd: HandleDragEndCallback;
  /** 边角拖拽开始回调，在共享几何变更前取得变换所有权 */
  onHandleDragStart: HandleDragStartCallback;
  /** 是否显示四边中点手柄 */
  showMidpoints?: boolean;
};

const HANDLE_SIZE = 22;
const HANDLE_HIT_AREA = 44;
const MIN_ELEM_SIZE = 20;

const cornerPositions: Record<CornerKey, { top: number | string; left: number | string; marginTop?: number; marginLeft?: number }> = {
  "top-left": { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 },
  "top-right": { top: -HANDLE_SIZE / 2, left: "100%" as any, marginLeft: -HANDLE_SIZE / 2 },
  "bottom-left": { top: "100%" as any, marginTop: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 },
  "bottom-right": { top: "100%" as any, marginTop: -HANDLE_SIZE / 2, left: "100%" as any, marginLeft: -HANDLE_SIZE / 2 },
};

/**
 * 选中元素上的可拖拽四角手柄。
 * 显示在元素选中框的四角，每只手柄可独立拖拽来调整元素宽高。
 * 容器使用共享值驱动尺寸，确保拖拽/缩放时手柄始终跟随元素。
 */
export function SelectionHandles({
  activeGestureCount,
  posX,
  posY,
  elemW,
  elemH,
  gestureScale,
  gestureGeneration,
  onHandleDragEnd,
  onHandleDragStart,
  showMidpoints = false,
}: SelectionHandlesProps) {
  // 容器使用共享值驱动尺寸，确保手柄始终跟随元素实时变化
  // gestureScale 确保捏合缩放时手柄也正确跟随
  const containerStyle = useAnimatedStyle(() => ({
    width: elemW.value * gestureScale.value,
    height: elemH.value * gestureScale.value,
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.container, containerStyle]}>
      {(Object.entries(cornerPositions) as [CornerKey, typeof cornerPositions[CornerKey]][]).map(([corner, pos]) => (
        <HandleDot
          corner={corner}
          activeGestureCount={activeGestureCount}
          elemH={elemH}
          elemW={elemW}
          key={corner}
          gestureGeneration={gestureGeneration}
          onDragEnd={onHandleDragEnd}
          onDragStart={onHandleDragStart}
          posX={posX}
          posY={posY}
          style={{
            position: "absolute",
            top: pos.top as number,
            left: pos.left as number,
            marginTop: pos.marginTop ?? 0,
            marginLeft: pos.marginLeft ?? 0,
          }}
        />
      ))}
      {showMidpoints ? (
        <HandleDot
          corner="top-left"
          activeGestureCount={activeGestureCount}
          elemH={elemH}
          elemW={elemW}
          key="mid-top"
          gestureGeneration={gestureGeneration}
          onDragEnd={onHandleDragEnd}
          onDragStart={onHandleDragStart}
          posX={posX}
          posY={posY}
          style={{ position: "absolute", top: -HANDLE_SIZE / 2, left: "50%" as any, marginLeft: -HANDLE_SIZE / 2 }}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * 单个可拖拽手柄圆点。
 * 所有位置/尺寸计算在 UI 线程 worklet 中直接操作共享值，
 * 无 JS 线程往返，无自身平移动画 —— 杜绝双重偏移。
 */
function HandleDot({
  activeGestureCount,
  corner,
  posX,
  posY,
  elemW,
  elemH,
  onDragEnd,
  onDragStart,
  gestureGeneration,
  style,
}: {
  activeGestureCount: SharedValue<number>;
  corner: CornerKey;
  posX: SharedValue<number>;
  posY: SharedValue<number>;
  elemW: SharedValue<number>;
  elemH: SharedValue<number>;
  onDragEnd: (generation: number) => void;
  onDragStart: () => void;
  gestureGeneration: SharedValue<number>;
  style: any;
}) {
  const isActive = useSharedValue(false);
  // 手势开始时记录起始值
  const initX = useSharedValue(0);
  const initY = useSharedValue(0);
  const initW = useSharedValue(0);
  const initH = useSharedValue(0);

  const pan = Gesture.Pan()
    .withTestId(`canvas-selection-handle-${corner}`)
    .onBegin(() => {
      "worklet";
      const acquiresTransform = activeGestureCount.value === 0;
      gestureGeneration.value = nextCanvasHandleGeneration(gestureGeneration.value);
      activeGestureCount.value += 1;
      if (acquiresTransform) {
        runOnJS(onDragStart)();
      }
      isActive.value = true;
      initX.value = posX.value;
      initY.value = posY.value;
      initW.value = elemW.value;
      initH.value = elemH.value;
    })
    .onUpdate((event) => {
      "worklet";
      const dx = event.translationX;
      const dy = event.translationY;

      switch (corner) {
        case "top-left":
          // 拖动左上角：移动左/上边缘，保持右下角固定
          posX.value = initX.value + dx;
          posY.value = initY.value + dy;
          elemW.value = Math.max(MIN_ELEM_SIZE, initW.value - dx);
          elemH.value = Math.max(MIN_ELEM_SIZE, initH.value - dy);
          break;
        case "top-right":
          // 拖动右上角：移动上边缘，扩展右边缘
          posY.value = initY.value + dy;
          elemW.value = Math.max(MIN_ELEM_SIZE, initW.value + dx);
          elemH.value = Math.max(MIN_ELEM_SIZE, initH.value - dy);
          break;
        case "bottom-left":
          // 拖动左下角：移动左边缘，扩展下边缘
          posX.value = initX.value + dx;
          elemW.value = Math.max(MIN_ELEM_SIZE, initW.value - dx);
          elemH.value = Math.max(MIN_ELEM_SIZE, initH.value + dy);
          break;
        case "bottom-right":
          // 拖动右下角：扩展右/下边缘，保持左上角固定
          elemW.value = Math.max(MIN_ELEM_SIZE, initW.value + dx);
          elemH.value = Math.max(MIN_ELEM_SIZE, initH.value + dy);
          break;
      }
    })
    .onFinalize(() => {
      "worklet";
      if (!isActive.value) return;
      isActive.value = false;
      activeGestureCount.value = Math.max(0, activeGestureCount.value - 1);
      if (activeGestureCount.value === 0) {
        runOnJS(onDragEnd)(gestureGeneration.value);
      }
    });

  // 仅保留缩放动画，不再使用 translateX/translateY
  // 手柄的位置由父容器的共享值 (posX, posY, elemW, elemH) 驱动
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isActive.value ? 1.3 : 1 }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.handleDot, animatedStyle, style]}>
        {/* 增大触摸区域 */}
        <View style={styles.handleHitArea} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 0,
    position: "absolute",
    top: 0,
    zIndex: 10000,
  },
  handleDot: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#B76545",
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 2.5,
    elevation: 6,
    height: HANDLE_SIZE,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: HANDLE_SIZE,
    zIndex: 10001,
  },
  handleHitArea: {
    height: HANDLE_HIT_AREA,
    width: HANDLE_HIT_AREA,
  },
});
