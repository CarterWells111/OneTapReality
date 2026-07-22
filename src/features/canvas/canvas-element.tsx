import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Pressable, StyleSheet, Text } from "react-native";

import { canvasFonts, canvasStickers } from "./canvas-assets";
import type { CanvasElement as CanvasElementModel } from "../../types/memory";

type ElementPatch = Pick<CanvasElementModel, "x" | "y" | "width" | "height" | "rotation">;

type CanvasElementProps = {
  canvasSize: number;
  element: CanvasElementModel;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onTransformEnd?: (id: string, patch: ElementPatch) => void;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export function CanvasElement({
  canvasSize,
  element,
  isSelected,
  onSelect,
  onTransformEnd,
}: CanvasElementProps) {
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);

  const finishTransform = () => {
    const scaledWidth = clamp(element.width * scale.value, 0.05, 1);
    const scaledHeight = clamp(element.height * scale.value, 0.05, 1);
    const x = clamp(element.x + offsetX.value / canvasSize, 0, 1 - scaledWidth);
    const y = clamp(element.y + offsetY.value / canvasSize, 0, 1 - scaledHeight);
    const finalRotation = element.rotation + rotation.value;

    offsetX.value = 0;
    offsetY.value = 0;
    scale.value = 1;
    rotation.value = 0;
    onTransformEnd?.(element.id, { x, y, width: scaledWidth, height: scaledHeight, rotation: finalRotation });
  };

  const pan = Gesture.Pan()
    .onBegin(() => runOnJS(onSelect)(element.id))
    .onUpdate((event) => {
      offsetX.value = event.translationX;
      offsetY.value = event.translationY;
    })
    .onEnd(() => runOnJS(finishTransform)());
  const pinch = Gesture.Pinch()
    .onBegin(() => runOnJS(onSelect)(element.id))
    .onUpdate((event) => {
      scale.value = event.scale;
    })
    .onEnd(() => runOnJS(finishTransform)());
  const rotate = Gesture.Rotation()
    .onBegin(() => runOnJS(onSelect)(element.id))
    .onUpdate((event) => {
      rotation.value = event.rotation;
    })
    .onEnd(() => runOnJS(finishTransform)());

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

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}>
      <Animated.View style={[styles.positioned, frameStyle, animatedStyle]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect(element.id)}
          style={[styles.element, isSelected && styles.selected]}
          testID={`canvas-element-${element.id}`}>
          <ElementContent element={element} />
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
