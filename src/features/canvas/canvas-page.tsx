import { Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";

import { canvasBackgrounds } from "./canvas-assets";
import { CanvasElement } from "./canvas-element";
import { colors } from "../../components/ui";
import type { CanvasElement as CanvasElementModel, CanvasLayout } from "../../types/memory";

type ElementPatch = Pick<CanvasElementModel, "x" | "y" | "width" | "height" | "rotation">;

type CanvasPageProps = {
  displayAspectRatio?: number;
  height?: number;
  layout: CanvasLayout;
  selectedElementId?: string;
  onPressBlank?: () => void;
  onInteractElement?: (id: string) => void;
  onSelectElement?: (id: string) => void;
  onTransformEnd?: (id: string, patch: ElementPatch) => void;
  interactive?: boolean;
  pageSide?: "left" | "right";
  width?: number;
};

export function CanvasPage({
  displayAspectRatio = 1,
  height,
  layout,
  selectedElementId,
  onPressBlank,
  onInteractElement,
  onSelectElement = () => undefined,
  onTransformEnd,
  interactive = true,
  pageSide,
  width: requestedWidth,
}: CanvasPageProps) {
  const { width } = useWindowDimensions();
  const canvasWidth = requestedWidth ?? Math.min(Math.max(width - 40, 280), 420);
  const canvasHeight = height ?? canvasWidth / displayAspectRatio;
  const elements = [...layout.elements].sort((left, right) => left.zIndex - right.zIndex);
  const canPressBlank = interactive && onPressBlank !== undefined;
  const background = canvasBackgrounds.find((asset) => asset.id === layout.backgroundId);

  return (
    <Pressable
      accessible={false}
      disabled={!canPressBlank}
      onPress={canPressBlank ? onPressBlank : undefined}
      style={[
        styles.canvas,
        pageSide === "right" && styles.rightPage,
        pageSide === "left" && styles.leftPage,
        { height: canvasHeight, width: canvasWidth },
      ]}
      testID="album-canvas">
      {background ? (
        <Image
          contentFit="cover"
          pointerEvents="none"
          source={background.source}
          style={StyleSheet.absoluteFill}
          testID={`canvas-background-${background.id}`}
        />
      ) : null}
      {elements.map((element) => (
        <CanvasElement
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          element={element}
          interactive={interactive}
          isSelected={interactive && element.id === selectedElementId}
          key={element.id}
          onInteract={onInteractElement}
          selectionContext={selectedElementId}
          onSelect={onSelectElement}
          onTransformEnd={interactive ? onTransformEnd : undefined}
        />
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  canvas: {
    alignSelf: "center",
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  rightPage: {
    borderBottomLeftRadius: 2,
    borderTopLeftRadius: 2,
  },
  leftPage: {
    borderBottomRightRadius: 2,
    borderTopRightRadius: 2,
  },
});
