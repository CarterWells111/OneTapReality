import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { canvasFonts, canvasStickers } from "./canvas-assets";
import type { CanvasElement as CanvasElementModel } from "../../types/memory";

type ElementPatch = Pick<CanvasElementModel, "x" | "y" | "width" | "height" | "rotation">;

type CanvasElementProps = {
  canvasSize: number;
  element: CanvasElementModel;
  interactive: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onTransformEnd?: (id: string, patch: ElementPatch) => void;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export function calculateCanvasTransform(
  element: Pick<CanvasElementModel, "x" | "y" | "width" | "height" | "rotation">,
  transform: { rotation: number; scale: number; translationX: number; translationY: number },
  canvasSize: number,
): ElementPatch {
  const width = clamp(element.width * transform.scale, 0.05, 1);
  const height = clamp(element.height * transform.scale, 0.05, 1);
  const x = clamp(element.x + transform.translationX / canvasSize + (element.width - width) / 2, 0, 1 - width);
  const y = clamp(element.y + transform.translationY / canvasSize + (element.height - height) / 2, 0, 1 - height);
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
  canvasSize,
  element,
  interactive,
  isSelected,
  onSelect,
  onTransformEnd,
}: CanvasElementProps) {
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
      canvasSize,
    ));
  };

  const beginGesture = (started: typeof panStarted) => {
    "worklet";
    started.value = true;
    activeGestureCount.value += 1;
    runOnJS(onSelect)(element.id);
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
    .enabled(interactive)
    .onBegin(() => beginGesture(panStarted))
    .onUpdate((event) => {
      offsetX.value = event.translationX;
      offsetY.value = event.translationY;
    })
    .onFinalize(() => finalizeGesture(panStarted));
  const pinch = Gesture.Pinch()
    .enabled(interactive)
    .onBegin(() => beginGesture(pinchStarted))
    .onUpdate((event) => {
      scale.value = event.scale;
    })
    .onFinalize(() => finalizeGesture(pinchStarted));
  const rotate = Gesture.Rotation()
    .enabled(interactive)
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
    left: element.x * canvasSize,
    top: element.y * canvasSize,
    width: element.width * canvasSize,
    height: element.height * canvasSize,
    zIndex: element.zIndex,
  };

  const content = <ElementContent element={element} />;
  if (!interactive) {
    return <View style={[styles.positioned, frameStyle]} testID={`canvas-element-${element.id}`}>{content}</View>;
  }

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={[styles.positioned, frameStyle, animatedStyle]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect(element.id)}
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
    return <Text style={styles.sticker}>{sticker?.glyph ?? "✦"}</Text>;
  }
  const font = canvasFonts.find((candidate) => candidate.id === element.fontStyle);
  return <Text style={[styles.text, { color: element.color, fontFamily: font?.family }]}>{element.text}</Text>;
}

const styles = StyleSheet.create({
  positioned: { position: "absolute" },
  element: { flex: 1, borderColor: "transparent", borderRadius: 8, overflow: "hidden" },
  selected: { borderColor: "#1C5A4C", borderWidth: 2 },
  image: { flex: 1, width: "100%" },
  text: { fontSize: 16, lineHeight: 22, paddingHorizontal: 4, paddingVertical: 2 },
  sticker: { fontSize: 34, lineHeight: 40, textAlign: "center" },
});
