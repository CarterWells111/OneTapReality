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
  /** 字体/字号/颜色面板回调（仅在选中文字元素时可用） */
  onFont?: () => void;
  onSize?: () => void;
  onColor?: () => void;
};

/**
 * 画布编辑器工具栏。
 *
 * 单行布局（全部左对齐）：
 *   字体 | 字号 | 颜色（仅文字元素选中时） | 前移 | 后移 | 复制 | 删除（任何元素选中时）
 *
 * "添加文字"已移至编辑器顶栏右侧；撤销/重做已移至顶栏左侧。
 */
export function CanvasToolbar({
  selectedElement,
  onAddText: _onAddText,
  onAddSticker: _onAddSticker,
  onAddFrame: _onAddFrame,
  onPickBackground: _onPickBackground,
  onUpdateElement: _onUpdateElement,
  onChangeLayer,
  onDuplicate,
  onDelete,
  onDone: _onDone,
  onFont,
  onSize,
  onColor,
}: CanvasToolbarProps) {
  const selectedId = selectedElement?.id;
  const isTextSelected = selectedElement?.type === "text";
  const hasSelection = selectedId !== undefined;

  if (!hasSelection && !isTextSelected) {
    return null;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.row}>
        {isTextSelected ? (
          <>
            <ToolbarButton label="字体" onPress={() => onFont?.()} />
            <ToolbarButton label="字号" onPress={() => onSize?.()} />
            <ToolbarButton label="颜色" onPress={() => onColor?.()} />
          </>
        ) : null}
        {hasSelection ? (
          <>
            <ToolbarButton label="前移" onPress={() => onChangeLayer(selectedId, "forward")} />
            <ToolbarButton label="后移" onPress={() => onChangeLayer(selectedId, "backward")} />
            <ToolbarButton label="复制" onPress={() => onDuplicate(selectedId)} />
            <ToolbarButton destructive label="删除" onPress={() => onDelete(selectedId)} />
          </>
        ) : null}
      </View>
    </View>
  );
}

/** 独立的"添加文字"按钮，放在顶栏使用 */
export function AddTextButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={addTextStyles.button}>
      <Text style={addTextStyles.text}>添加文字</Text>
    </Pressable>
  );
}

const addTextStyles = StyleSheet.create({
  button: {
    backgroundColor: "#F7E2BF",
    borderColor: "#B76545",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: { color: "#B76545", fontFamily: bodyFont, fontSize: 12.5, fontWeight: "800" },
});

/**
 * 撤销/重做按钮对 —— 放置在编辑器顶栏左侧。
 */
export function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  return (
    <View style={undoRedoStyles.row}>
      <UndoRedoButton
        disabled={!canUndo}
        label="↩"
        onPress={() => onUndo?.()}
      />
      <UndoRedoButton
        disabled={!canRedo}
        label="↪"
        onPress={() => onRedo?.()}
      />
    </View>
  );
}

function UndoRedoButton({
  disabled = false,
  label,
  onPress,
}: {
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
        undoRedoStyles.button,
        disabled && undoRedoStyles.disabled,
      ]}>
      <Text style={[
        undoRedoStyles.text,
        disabled && undoRedoStyles.disabledText,
      ]}>{label}</Text>
    </Pressable>
  );
}

const undoRedoStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4 },
  button: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D9DED7",
    borderRadius: 8,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  text: { color: "#1C2C28", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.25 },
  disabledText: {},
});

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
  shell: { borderTopColor: "#E1E6DF", borderTopWidth: 1, paddingVertical: 8 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-start",
    paddingHorizontal: 20,
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
