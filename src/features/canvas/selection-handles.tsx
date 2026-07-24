import * as React from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { StyleSheet, View } from "react-native";

/**
 * 选中元素四角 + 四边中点的手柄组件。
 * 支持自由拖拽调整元素宽高比，适用于所有元素类型（文字、图片、贴纸、相框）。
 */

export type HandleDragCallback = (
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  deltaX: number,
  deltaY: number,
) => void;

export type HandleDragEndCallback = () => void;

type SelectionHandlesProps = {
  /** 元素在画布上的绝对像素坐标 */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 旋转角度（度） */
  rotationDeg: number;
  /** 边角拖拽回调 */
  onHandleDrag: HandleDragCallback;
  /** 边角拖拽结束回调 */
  onHandleDragEnd: HandleDragEndCallback;
  /** 是否显示四边中点手柄 */
  showMidpoints?: boolean;
};

const HANDLE_SIZE = 22;
const HANDLE_HIT_AREA = 44;

const cornerPositions = {
  "top-left": { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 },
  "top-right": { top: -HANDLE_SIZE / 2, left: "100%" as any, marginLeft: -HANDLE_SIZE / 2 },
  "bottom-left": { top: "100%" as any, marginTop: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 },
  "bottom-right": { top: "100%" as any, marginTop: -HANDLE_SIZE / 2, left: "100%" as any, marginLeft: -HANDLE_SIZE / 2 },
};

/**
 * 选中元素上的可拖拽四角手柄。
 * 显示在元素选中框的四角，每只手柄可独立拖拽来调整元素宽高。
 */
export function SelectionHandles({
  left,
  top,
  width,
  height,
  rotationDeg,
  onHandleDrag,
  onHandleDragEnd,
  showMidpoints = false,
}: SelectionHandlesProps) {
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        { left, top, width, height, transform: [{ rotate: `${rotationDeg}deg` }] },
      ]}>
      {(Object.entries(cornerPositions) as [keyof typeof cornerPositions, { top: any; left: any; marginTop?: number; marginLeft?: number }][]).map(([corner, pos]) => (
        <HandleDot
          corner={corner}
          key={corner}
          onDrag={onHandleDrag}
          onDragEnd={onHandleDragEnd}
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
        <>
          <HandleDot corner="top-left" key="mid-top" onDrag={(_, dx, dy) => onHandleDrag("top-left", 0, dy)} onDragEnd={onHandleDragEnd} style={{ position: "absolute", top: -HANDLE_SIZE / 2, left: "50%" as any, marginLeft: -HANDLE_SIZE / 2 }} />
        </>
      ) : null}
    </View>
  );
}

function HandleDot({
  corner,
  onDrag,
  onDragEnd,
  style,
}: {
  corner: keyof typeof cornerPositions;
  onDrag: HandleDragCallback;
  onDragEnd: HandleDragEndCallback;
  style: any;
}) {
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const isActive = useSharedValue(false);

  const pan = Gesture.Pan()
    .onBegin(() => {
      isActive.value = true;
    })
    .onUpdate((event) => {
      offsetX.value = event.translationX;
      offsetY.value = event.translationY;
      runOnJS(onDrag)(corner, event.translationX, event.translationY);
    })
    .onFinalize(() => {
      isActive.value = false;
      offsetX.value = 0;
      offsetY.value = 0;
      runOnJS(onDragEnd)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: isActive.value ? 1.3 : 1 },
    ],
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
    position: "absolute",
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
