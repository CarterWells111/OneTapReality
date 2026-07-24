import { Pressable, StyleSheet, Text, View } from "react-native";

import { bodyFont } from "../../components/ui";
import type { CanvasElement, CanvasTextElement } from "../../types/memory";

type CanvasToolbarProps = {
  selectedElement?: CanvasElement;
  onAddText: () => void;
  onAddSticker: (stickerId?: string) => void;
  onAddFrame: () => void;
  onPickBackground: () => void;
  onUpdateElement: (id: string, patch: Partial<CanvasTextElement>) => void;
  onChangeLayer: (id: string, direction: "forward" | "backward") => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDone?: () => void;
  /** 撤销/重做（由父组件传入） */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
};

/**
 * 画布编辑器工具栏。
 *
 * 第一行：添加文字（左） | 撤销/重做（右）
 * 第二行（选中元素时出现）：前移 | 后移 | 复制 | 删除 | 完成
 *
 * 添加贴纸/相框/背景已移至底部素材托盘。
 */
export function CanvasToolbar({
  selectedElement,
  onAddText,
  onAddSticker: _onAddSticker,
  onAddFrame: _onAddFrame,
  onPickBackground: _onPickBackground,
  onUpdateElement: _onUpdateElement,
  onChangeLayer,
  onDuplicate,
  onDelete,
  onDone,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: CanvasToolbarProps) {
  const selectedId = selectedElement?.id;

  return (
    <View style={styles.shell}>
      {/* 第一行：添加文字 + 撤销/重做 */}
      <View style={styles.row}>
        <ToolbarButton active label="添加文字" onPress={onAddText} />
        <View style={styles.spacer} />
        <View style={styles.undoRedoButtons}>
          <ToolbarButton
            disabled={!canUndo}
            label="撤销"
            onPress={() => onUndo?.()}
          />
          <ToolbarButton
            disabled={!canRedo}
            label="重做"
            onPress={() => onRedo?.()}
          />
        </View>
      </View>

      {/* 第二行：元素操作（仅在选中元素时显示） */}
      {selectedId ? (
        <View style={styles.row}>
          <ToolbarButton label="前移" onPress={() => onChangeLayer(selectedId, "forward")} />
          <ToolbarButton label="后移" onPress={() => onChangeLayer(selectedId, "backward")} />
          <ToolbarButton label="复制" onPress={() => onDuplicate(selectedId)} />
          <ToolbarButton destructive label="删除" onPress={() => onDelete(selectedId)} />
          {onDone ? <ToolbarButton active label="完成" onPress={onDone} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function ToolbarButton({
  active = false,
  destructive = false,
  disabled = false,
  label,
  onPress,
}: {
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        active && styles.activeButton,
        destructive && styles.destructiveButton,
        disabled && styles.disabledButton,
      ]}>
      <Text
        style={[
          styles.buttonText,
          active && styles.activeText,
          destructive && styles.destructiveText,
          disabled && styles.disabledText,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { borderTopColor: "#E1E6DF", borderTopWidth: 1, gap: 8, paddingVertical: 8 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
  },
  spacer: { flex: 1 },
  undoRedoButtons: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
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
  disabledButton: { opacity: 0.3 },
  buttonText: { color: "#1C2C28", fontFamily: bodyFont, fontSize: 13, fontWeight: "600" },
  activeText: { color: "#B76545" },
  destructiveText: { color: "#A44736" },
  disabledText: { color: "#9BA89E" },
});
