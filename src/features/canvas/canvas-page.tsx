import { Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useFonts } from "expo-font";

import { canvasBackgrounds } from "./canvas-assets";
import { CanvasElement } from "./canvas-element";
import { colors } from "../../components/ui";
import { canvasEditorFontSources } from "../typography/fonts";
import type { CanvasLayout } from "../../types/memory";

type ElementPatch = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontSize?: number;
};

type CanvasPageProps = {
  displayAspectRatio?: number;
  /**
   * 去掉圆角与描边，让背景/元素铺满整个矩形。
   * 用于 PDF 截图导出——否则截图四角是透明的，PDF 里会露出白色圆角缺口。
   */
  flatEdges?: boolean;
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
  displayAspectRatio = 3 / 4,
  flatEdges = false,
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
  // 编辑器、阅读器、分享导出都经 CanvasPage 渲染：在这里加载全部画布字体，
  // 保证重开相册阅读时文字仍使用所选字体（expo-font 对已注册字体幂等）。
  useFonts(canvasEditorFontSources);
  const { width } = useWindowDimensions();
  const canvasWidth = requestedWidth ?? Math.min(Math.max(width - 40, 280), 420);
  const canvasHeight = height ?? canvasWidth / displayAspectRatio;
  // 选中元素提升到最高视觉层级，防止被上层未选中元素阻挡触摸
  const elements = [...layout.elements].sort((left, right) => {
    if (interactive) {
      if (left.id === selectedElementId && right.id !== selectedElementId) return 1;
      if (right.id === selectedElementId && left.id !== selectedElementId) return -1;
    }
    return left.zIndex - right.zIndex;
  });
  const canPressBlank = interactive && onPressBlank !== undefined;
  const background = canvasBackgrounds.find((asset) => asset.id === layout.backgroundId);
  const coverSolidColor = layout.coverColor ?? undefined;
  const coverImageUri = layout.coverImage ?? undefined;
  // 封面页有 coverColor 或 coverImage 时使用自定义封面背景
  const hasCoverBackground = !background && (coverSolidColor || coverImageUri);

  return (
    <Pressable
      accessible={false}
      disabled={!canPressBlank}
      onPress={canPressBlank ? onPressBlank : undefined}
      style={[
        styles.canvas,
        pageSide === "right" && styles.rightPage,
        pageSide === "left" && styles.leftPage,
        hasCoverBackground && { backgroundColor: coverSolidColor ?? "#EFE2CF" },
        { height: canvasHeight, width: canvasWidth },
        flatEdges && styles.flatEdges,
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
      {/* 封面自定义背景图 */}
      {!background && coverImageUri ? (
        <Image
          contentFit="cover"
          pointerEvents="none"
          source={{ uri: coverImageUri }}
          style={StyleSheet.absoluteFill}
          testID="canvas-cover-image"
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
  // 导出截图用：四角方正、无描边，避免 PDF 中出现白色圆角缺口
  flatEdges: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 0,
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
