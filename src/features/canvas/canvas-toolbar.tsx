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

/**
 * 画布编辑器工具栏。
 *
 * 两行布局：
 * - 第一行（始终显示）：添加文字 | 添加贴纸 | 添加相框 | 选择背景
 * - 第二行（选中元素时出现）：前移 | 后移 | 复制 | 删除 | 完成
 *
 * 字体/字号/颜色已移至 ElementContextMenu。
 */
export function CanvasToolbar({
  selectedElement,
  onAddText,
  onAddSticker,
  onAddFrame,
  onPickBackground,
  onUpdateElement: _onUpdateElement,
  onChangeLayer,
  onDuplicate,
  onDelete,
  onDone,
}: CanvasToolbarProps) {
  const selectedId = selectedElement?.id;

  return (
    <View style={styles.shell}>
      {/* 第一行：添加操作 */}
      <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
        <ToolbarButton active label="添加文字" onPress={onAddText} />
        <ToolbarButton label="添加贴纸" onPress={() => onAddSticker()} />
        <ToolbarButton label="添加相框" onPress={onAddFrame} />
        <ToolbarButton label="选择背景" onPress={onPickBackground} />
      </ScrollView>

      {/* 第二行：元素操作（仅在选中元素时显示） */}
      {selectedId ? (
        <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
          <ToolbarButton label="前移" onPress={() => onChangeLayer(selectedId, "forward")} />
          <ToolbarButton label="后移" onPress={() => onChangeLayer(selectedId, "backward")} />
          <ToolbarButton label="复制" onPress={() => onDuplicate(selectedId)} />
          <ToolbarButton destructive label="删除" onPress={() => onDelete(selectedId)} />
          {onDone ? <ToolbarButton active label="完成" onPress={onDone} /> : null}
        </ScrollView>
      ) : null}
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
  shell: { borderTopColor: "#E1E6DF", borderTopWidth: 1, gap: 8, paddingVertical: 8 },
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
