import { StyleSheet, View, useWindowDimensions } from "react-native";

import { CanvasElement } from "./canvas-element";
import { colors } from "../../components/ui";
import type { CanvasElement as CanvasElementModel, CanvasLayout } from "../../types/memory";

type ElementPatch = Pick<CanvasElementModel, "x" | "y" | "width" | "height" | "rotation">;

type CanvasPageProps = {
  height?: number;
  layout: CanvasLayout;
  selectedElementId?: string;
  onSelectElement?: (id: string) => void;
  onTransformEnd?: (id: string, patch: ElementPatch) => void;
  interactive?: boolean;
  pageSide?: "left" | "right";
  width?: number;
};

export function CanvasPage({
  height,
  layout,
  selectedElementId,
  onSelectElement = () => undefined,
  onTransformEnd,
  interactive = true,
  pageSide,
  width: requestedWidth,
}: CanvasPageProps) {
  const { width } = useWindowDimensions();
  const canvasWidth = requestedWidth ?? Math.min(Math.max(width - 40, 280), 420);
  const canvasHeight = height ?? canvasWidth;
  const elements = [...layout.elements].sort((left, right) => left.zIndex - right.zIndex);

  return (
    <View
      style={[
        styles.canvas,
        pageSide === "right" && styles.rightPage,
        pageSide === "left" && styles.leftPage,
        { height: canvasHeight, width: canvasWidth },
      ]}
      testID="album-canvas">
      {elements.map((element) => (
        <CanvasElement
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          element={element}
          interactive={interactive}
          isSelected={interactive && element.id === selectedElementId}
          key={element.id}
          onSelect={onSelectElement}
          onTransformEnd={interactive ? onTransformEnd : undefined}
        />
      ))}
    </View>
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
