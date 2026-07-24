import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { canvasFonts, canvasFrames, canvasStickers } from "./canvas-assets";
import type { CanvasElement as CanvasElementModel } from "../../types/memory";

type ElementPatch = Pick<CanvasElementModel, "x" | "y" | "width" | "height" | "rotation">;

type CanvasDimensions = { width: number; height: number };

type CanvasElementProps = {
  canvasHeight: number;
  canvasWidth: number;
  element: CanvasElementModel;
  interactive: boolean;
  isSelected: boolean;
  selectionContext: string | undefined;
  onSelect: (id: string) => void;
  onTransformEnd?: (id: string, patch: ElementPatch) => void;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export function calculateCanvasTransform(
  element: Pick<CanvasElementModel, "x" | "y" | "width" | "height" | "rotation">,
  transform: { rotation: number; scale: number; translationX: number; translationY: number },
  canvasDimensions: number | CanvasDimensions,
): ElementPatch {
  const { width: canvasWidth, height: canvasHeight } = typeof canvasDimensions === "number"
    ? { width: canvasDimensions, height: canvasDimensions }
    : canvasDimensions;
  const width = clamp(element.width * transform.scale, 0.05, 1);
  const height = clamp(element.height * transform.scale, 0.05, 1);
  const x = clamp(element.x + transform.translationX / canvasWidth + (element.width - width) / 2, 0, 1 - width);
  const y = clamp(element.y + transform.translationY / canvasHeight + (element.height - height) / 2, 0, 1 - height);
  return { x, y, width, height, rotation: element.rotation + transform.rotation };
}

export function finalizeCanvasGesture(started: boolean, activeGestureCount: number) {
  "worklet";
  if (!started) {
    return { activeGestureCount, shouldCommit: false };
  }
  const nextCount = Math.max(0, activeGestureCount - 1);
  return { activeGestureCount: nextCount, shouldCommit: nextCount === 0 };
}

export function CanvasElement({
  canvasHeight,
  canvasWidth,
  element,
  interactive,
  isSelected,
  selectionContext,
  onSelect,
  onTransformEnd,
}: CanvasElementProps) {
  const lastPressAt = React.useRef<number | null>(null);

  React.useEffect(() => {
    lastPressAt.current = null;
  }, [selectionContext]);

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const activeGestureCount = useSharedValue(0);
  const panStarted = useSharedValue(false);
  const pinchStarted = useSharedValue(false);
  const rotationStarted = useSharedValue(false);

  const commitTransform = (translationX: number, translationY: number, nextScale: number, nextRotation: number) => {
    onTransformEnd?.(element.id, calculateCanvasTransform(
      element,
      { translationX, translationY, scale: nextScale, rotation: nextRotation },
      { width: canvasWidth, height: canvasHeight },
    ));
  };

  const beginGesture = (started: typeof panStarted) => {
    "worklet";
    started.value = true;
    activeGestureCount.value += 1;
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
    const translationX = offsetX.value;
    const translationY = offsetY.value;
    const nextScale = scale.value;
    const nextRotation = rotation.value;
    offsetX.value = 0;
    offsetY.value = 0;
    scale.value = 1;
    rotation.value = 0;
    runOnJS(commitTransform)(translationX, translationY, nextScale, nextRotation);
  };

  const pan = Gesture.Pan()
    .enabled(interactive && isSelected)
    .onBegin(() => beginGesture(panStarted))
    .onUpdate((event) => {
      offsetX.value = event.translationX;
      offsetY.value = event.translationY;
    })
    .onFinalize(() => finalizeGesture(panStarted));
  const pinch = Gesture.Pinch()
    .enabled(interactive && isSelected)
    .onBegin(() => beginGesture(pinchStarted))
    .onUpdate((event) => {
      scale.value = event.scale;
    })
    .onFinalize(() => finalizeGesture(pinchStarted));
  const rotate = Gesture.Rotation()
    .enabled(interactive && isSelected)
    .onBegin(() => beginGesture(rotationStarted))
    .onUpdate((event) => {
      rotation.value = event.rotation;
    })
    .onFinalize(() => finalizeGesture(rotationStarted));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
      { rotate: `${element.rotation + rotation.value}rad` },
    ],
  }));
  const frameStyle = {
    left: element.x * canvasWidth,
    top: element.y * canvasHeight,
    width: element.width * canvasWidth,
    height: element.height * canvasHeight,
    zIndex: element.zIndex,
  };
  const savedRotationStyle = {
    transform: [{ rotate: `${element.rotation}rad` }],
  };

  const content = <ElementContent element={element} />;
  if (!interactive) {
    return (
      <View
        style={[styles.positioned, frameStyle, savedRotationStyle]}
        testID={`canvas-element-${element.id}`}>
        {content}
      </View>
    );
  }

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={[styles.positioned, frameStyle, animatedStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="双击以选中并编辑"
          onPress={() => {
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
          {content}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

function ElementContent({ element }: { element: CanvasElementModel }) {
  if (element.type === "image") {
    return <Image contentFit="cover" source={element.uri} style={styles.image} testID={`canvas-image-${element.id}`} />;
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
    <Text
      style={[
        styles.text,
        {
          color: element.color,
          fontFamily: font?.family,
          fontSize: element.fontSize,
          lineHeight: Math.round(element.fontSize * 1.28),
        },
      ]}>
      {element.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  positioned: { position: "absolute" },
  element: { flex: 1, borderColor: "transparent", borderRadius: 8, overflow: "hidden" },
  selected: { borderColor: "#B76545", borderWidth: 2 },
  image: { flex: 1, width: "100%" },
  text: { paddingHorizontal: 4, paddingVertical: 2 },
  stickerFallback: { fontSize: 34, lineHeight: 40, textAlign: "center" },
});
