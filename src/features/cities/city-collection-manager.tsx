import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";

import { colors } from "../../components/ui";
import type { Memory } from "../../types/memory";
import { reorderCityMemoryIds } from "./city-workspace";

type CityCollectionManagerProps = {
  readonly memories: readonly Memory[];
  readonly featuredMemoryId: string | null;
  readonly onSave: (memoryIds: string[], featuredMemoryId: string | null) => void;
  readonly onCancel: () => void;
};

const rowHeight = 92;

export function CityCollectionManager({ featuredMemoryId, memories, onCancel, onSave }: CityCollectionManagerProps) {
  const [memoryIds, setMemoryIds] = React.useState(() => memories.map((memory) => memory.id));
  const [selectedId, setSelectedId] = React.useState<string | null>(featuredMemoryId ?? memories[0]?.id ?? null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOffset, setDragOffset] = React.useState(0);
  const dragY = useSharedValue(0);
  const memoryById = React.useMemo(() => new Map(memories.map((memory) => [memory.id, memory])), [memories]);

  const commitDrag = React.useCallback((memoryId: string, sourceIndex: number, translationY: number) => {
    setMemoryIds((current) => reorderCityMemoryIds(current, memoryId, sourceIndex + Math.round(translationY / rowHeight)));
    setDraggingId(null);
    setDragOffset(0);
  }, []);

  if (memoryIds.length === 0) {
    return <Text selectable style={{ color: colors.muted }}>No saved memories to manage.</Text>;
  }

  return (
    <View style={{ gap: 12 }}>
      <Text selectable style={{ color: colors.muted, lineHeight: 21 }}>Long press and drag a memory to reorder it. Choose one representative before saving.</Text>
      {memoryIds.map((memoryId, index) => {
        const memory = memoryById.get(memoryId);
        if (!memory) return null;
        const pan = Gesture.Pan()
          .activateAfterLongPress(300)
          .onBegin(() => {
            runOnJS(setDraggingId)(memoryId);
          })
          .onUpdate((event) => {
            dragY.value = event.translationY;
            runOnJS(setDragOffset)(event.translationY);
          })
          .onFinalize((event) => {
            runOnJS(commitDrag)(memoryId, index, event.translationY);
          });
        const isDragging = draggingId === memoryId;
        return (
          <GestureDetector key={memoryId} gesture={pan}>
            <View style={{ backgroundColor: colors.surface, borderColor: isDragging ? colors.accent : colors.line, borderRadius: 16, borderWidth: isDragging ? 2 : 1, gap: 8, minHeight: 76, opacity: isDragging ? 0.86 : 1, padding: 14, transform: isDragging ? [{ translateY: dragOffset }] : [] }}>
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                <Text selectable style={{ color: colors.ink, flex: 1, fontSize: 17, fontWeight: "700" }}>{memory.title}</Text>
                <Text selectable style={{ color: colors.muted, fontSize: 13 }}>Long press to drag</Text>
              </View>
              <Pressable
                accessibilityLabel={`Set ${memory.title} as representative`}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedId === memoryId }}
                onPress={() => setSelectedId(memoryId)}
                style={({ pressed }) => ({ alignItems: "center", alignSelf: "flex-start", backgroundColor: selectedId === memoryId ? colors.accentSoft : colors.background, borderColor: selectedId === memoryId ? colors.accent : colors.line, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 44, opacity: pressed ? 0.82 : 1, paddingHorizontal: 12 })}
              >
                <Text selectable style={{ color: colors.ink, fontWeight: "700" }}>{selectedId === memoryId ? "Representative" : "Set representative"}</Text>
              </Pressable>
            </View>
          </GestureDetector>
        );
      })}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable accessibilityLabel="Cancel collection changes" accessibilityRole="button" onPress={onCancel} style={({ pressed }) => ({ alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 14, flex: 1, justifyContent: "center", minHeight: 48, opacity: pressed ? 0.82 : 1 })}>
          <Text selectable style={{ color: colors.accent, fontSize: 16, fontWeight: "700" }}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityLabel="Save collection changes" accessibilityRole="button" onPress={() => onSave(memoryIds, selectedId)} style={({ pressed }) => ({ alignItems: "center", backgroundColor: colors.accent, borderRadius: 14, flex: 1, justifyContent: "center", minHeight: 48, opacity: pressed ? 0.82 : 1 })}>
          <Text selectable style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
