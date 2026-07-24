import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { canvasFonts, canvasStickers } from "./canvas-assets";
import { bodyFont } from "../../components/ui";
import type { CanvasElement, CanvasTextElement } from "../../types/memory";

type CanvasToolbarProps = {
  selectedElement?: CanvasElement;
  onAddText: () => void;
  onAddSticker: (stickerId?: (typeof canvasStickers)[number]["id"]) => void;
  onAddFrame: () => void;
  onPickBackground: () => void;
  onUpdateElement: (id: string, patch: Partial<CanvasTextElement>) => void;
  onChangeLayer: (id: string, direction: "forward" | "backward") => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDone?: () => void;
};

const colors = [
  { label: "墨黑", value: "#1C2C28" },
  { label: "深绿", value: "#1C5A4C" },
  { label: "暖红", value: "#A44736" },
  { label: "纸蓝", value: "#56708A" },
  { label: "铅灰", value: "#6B6B63" },
] as const;

const fontSizes = [12, 16, 18, 22, 28, 34] as const;

export function CanvasToolbar({
  selectedElement,
  onAddText,
  onAddSticker,
  onAddFrame,
  onPickBackground,
  onUpdateElement,
  onChangeLayer,
  onDuplicate,
  onDelete,
  onDone,
}: CanvasToolbarProps) {
  const selectedId = selectedElement?.id;
  const selectedText = selectedElement?.type === "text" ? selectedElement : undefined;

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
        <ToolbarButton label="添加文字" onPress={onAddText} />
        <ToolbarButton label="添加贴纸" onPress={() => onAddSticker()} />
        <ToolbarButton label="添加相框" onPress={onAddFrame} />
        <ToolbarButton label="选择背景" onPress={onPickBackground} />
        {selectedText
          ? fontSizes.map((fontSize) => (
              <ToolbarButton
                active={selectedText.fontSize === fontSize}
                key={fontSize}
                label={`${fontSize}`}
                onPress={() => onUpdateElement(selectedText.id, { fontSize })}
              />
            ))
          : null}
        {selectedText
          ? canvasFonts.map((font) => (
              <ToolbarButton
                active={selectedText.fontStyle === font.id}
                key={font.id}
                label={font.label}
                onPress={() => onUpdateElement(selectedText.id, { fontStyle: font.id })}
              />
            ))
          : null}
        {selectedText
          ? colors.map((color) => (
              <ToolbarButton
                active={selectedText.color === color.value}
                key={color.value}
                label={color.label}
                onPress={() => onUpdateElement(selectedText.id, { color: color.value })}
              />
            ))
          : null}
        {selectedId ? <ToolbarButton label="前移" onPress={() => onChangeLayer(selectedId, "forward")} /> : null}
        {selectedId ? <ToolbarButton label="后移" onPress={() => onChangeLayer(selectedId, "backward")} /> : null}
        {selectedId ? <ToolbarButton label="复制" onPress={() => onDuplicate(selectedId)} /> : null}
        {selectedId ? <ToolbarButton destructive label="删除" onPress={() => onDelete(selectedId)} /> : null}
        {selectedId && onDone ? <ToolbarButton active label="完成" onPress={onDone} /> : null}
      </ScrollView>
    </View>
  );
}

function ToolbarButton({
  active = false,
  destructive = false,
  label,
  onPress,
}: {
  active?: boolean;
  destructive?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, active && styles.activeButton, destructive && styles.destructiveButton]}>
      <Text style={[styles.buttonText, active && styles.activeText, destructive && styles.destructiveText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { borderTopColor: "#E1E6DF", borderTopWidth: 1, paddingVertical: 10 },
  row: { alignItems: "center", gap: 8, paddingHorizontal: 20 },
  button: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D9DED7",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  activeButton: { backgroundColor: "#F7E2BF", borderColor: "#B76545" },
  destructiveButton: { borderColor: "#E6B3AA" },
  buttonText: { color: "#1C2C28", fontFamily: bodyFont, fontSize: 13, fontWeight: "600" },
  activeText: { color: "#B76545" },
  destructiveText: { color: "#A44736" },
});
