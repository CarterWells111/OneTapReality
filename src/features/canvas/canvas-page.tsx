import { StyleSheet, View, useWindowDimensions } from "react-native";

import { CanvasElement } from "./canvas-element";
import { colors } from "../../components/ui";
import type { CanvasElement as CanvasElementModel, CanvasLayout } from "../../types/memory";

type ElementPatch = Pick<CanvasElementModel, "x" | "y" | "width" | "height" | "rotation">;

type CanvasPageProps = {
  layout: CanvasLayout;
  selectedElementId?: string;
  onSelectElement?: (id: string) => void;
  onTransformEnd?: (id: string, patch: ElementPatch) => void;
  interactive?: boolean;
};

export function CanvasPage({
  layout,
  selectedElementId,
  onSelectElement = () => undefined,
  onTransformEnd,
  interactive = true,
}: CanvasPageProps) {
  const { width } = useWindowDimensions();
  const canvasSize = Math.min(Math.max(width - 40, 280), 420);
  const elements = [...layout.elements].sort((left, right) => left.zIndex - right.zIndex);

  return (
    <View style={[styles.canvas, { height: canvasSize, width: canvasSize }]} testID="album-canvas">
      {elements.map((element) => (
        <CanvasElement
          canvasSize={canvasSize}
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
});
