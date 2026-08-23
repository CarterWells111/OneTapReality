import * as React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { resolveCanvasPreviewContentScale } from "../features/canvas/canvas-display-metrics";
import { createLegacyLayout } from "../features/canvas/canvas-layout";
import { CanvasPage } from "../features/canvas/canvas-page";
import type { Memory } from "../types/memory";

type MemoryBookCoverProps = {
  memory: Memory;
  onPress: () => void;
  /** 多选模式 */
  multiSelect?: boolean;
  selected?: boolean;
  onLongPress?: () => void;
};

export function MemoryBookCover({
  memory,
  onPress,
  multiSelect = false,
  selected = false,
  onLongPress,
}: MemoryBookCoverProps) {
  const [coverWidth, setCoverWidth] = React.useState(160);
  const { width: windowWidth } = useWindowDimensions();
  const firstPage = memory.pages[0];
  const firstPageLayout = firstPage
    ? firstPage.layout ?? createLegacyLayout(firstPage)
    : null;
  const contentScale = resolveCanvasPreviewContentScale(coverWidth, windowWidth);

  return (
    <View style={styles.bookSlot}>
      <Pressable
        accessibilityLabel={`打开旅行册 ${memory.title}`}
        accessibilityRole="button"
        onPress={onPress}
        onLongPress={() => {
          if (!multiSelect && onLongPress) {
            onLongPress();
          }
        }}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0 && width !== coverWidth) setCoverWidth(width);
        }}
        style={({ pressed }) => [
          styles.book,
          pressed && styles.pressed,
        ]}
      >
        {firstPageLayout ? (
          <View pointerEvents="none" style={styles.canvas}>
            <CanvasPage
              contentScale={contentScale}
              height={(coverWidth * 4) / 3}
              interactive={false}
              layout={firstPageLayout}
              pageSide="right"
              width={coverWidth}
            />
          </View>
        ) : <View style={styles.emptyCover} />}
      </Pressable>
      {/* 多选勾选框 */}
      {multiSelect ? (
        <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
          {selected ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bookSlot: { width: "48.5%" },
  book: {
    aspectRatio: 3 / 4,
    backgroundColor: "#EFE2CF",
    borderRadius: 10,
    overflow: "hidden",
    width: "100%",
  },
  canvas: { ...StyleSheet.absoluteFillObject },
  emptyCover: { backgroundColor: "#EFE2CF", flex: 1 },
  pressed: { opacity: 0.85 },
  checkCircle: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#C4B8A9",
    borderRadius: 14,
    borderWidth: 1.5,
    height: 28,
    justifyContent: "center",
    left: 8,
    position: "absolute",
    top: 8,
    width: 28,
  },
  checkCircleSelected: { backgroundColor: "#56708A", borderColor: "#56708A" },
  checkMark: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
});
