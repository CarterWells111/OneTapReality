import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { cityContent } from "../features/cities/city-content";
import type { Memory } from "../types/memory";

/** 书封面配色：以品牌米白纸感为主，见 docs/DECISIONS.md。 */
const bookColors = {
  cover: "#EFE2CF",
  spine: "#D8CFC4",
  spineEdge: "#C4B8A9",
  ink: "#2F2A26",
  accentLine: "#B56B52",
  meta: "#56708A",
} as const;

const serifFont = Platform.select({ android: "serif", default: "Georgia" });

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
  const city = cityContent[memory.city];

  return (
    <View style={styles.bookSlot}>
      <Pressable
        accessibilityLabel={`打开旅行册 ${memory.title}`}
        accessibilityRole="button"
        onPress={() => {
          if (multiSelect && onLongPress) {
            onLongPress();
          } else {
            onPress();
          }
        }}
        onLongPress={() => {
          if (!multiSelect && onLongPress) {
            onLongPress();
          }
        }}
        style={({ pressed }) => [
          styles.book,
          memory.coverColor ? { backgroundColor: memory.coverColor } : null,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.spine}>
          <View style={styles.spineEdge} />
        </View>
        <View style={styles.coverBody}>
          <View style={styles.titleBlock}>
            <Text numberOfLines={3} selectable style={styles.title}>{memory.title}</Text>
            <View style={styles.accentLine} />
          </View>
          <View>
            <Text numberOfLines={1} selectable style={styles.meta}>{city.name} · {memory.travelDate}</Text>
            <Text selectable style={styles.meta}>{memory.photoUris.length} 张照片</Text>
          </View>
        </View>
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
    backgroundColor: bookColors.cover,
    borderBottomRightRadius: 10,
    borderTopRightRadius: 10,
    flexDirection: "row",
    overflow: "hidden",
    width: "100%",
  },
  spine: { backgroundColor: bookColors.spine, flexDirection: "row", width: 9 },
  spineEdge: { backgroundColor: bookColors.spineEdge, marginLeft: "auto", width: 1.5 },
  coverBody: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 16,
  },
  titleBlock: { gap: 8 },
  title: {
    color: bookColors.ink,
    fontFamily: serifFont,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
  },
  accentLine: { backgroundColor: bookColors.accentLine, height: 2, width: 26 },
  meta: { color: bookColors.meta, fontSize: 11.5, lineHeight: 17 },
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
