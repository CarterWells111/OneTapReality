import * as React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { canvasFonts } from "./canvas-assets";
import { ColorPicker } from "../../components/ColorPicker";
import type { CanvasTextElement } from "../../types/memory";

type ElementContextMenuProps = {
  visible: boolean;
  element: CanvasTextElement;
  elementFrame: { x: number; y: number; width: number; height: number } | null;
  onChangeFont: (fontStyle: string) => void;
  onChangeSize: (fontSize: number) => void;
  onChangeColor: (color: string) => void;
  onClose: () => void;
  /** 初始面板模式。工具栏按钮可传入对应模式直达目标面板。 */
  initialMode?: MenuMode;
};

const FONT_SIZE_MIN = 2;
const FONT_SIZE_MAX = 40;

const presetColors = [
  "#1C2C28", // 墨黑
  "#1C5A4C", // 深绿
  "#A44736", // 暖红
  "#56708A", // 纸蓝
  "#6B6B63", // 铅灰
  "#B76545", // 砖橙
  "#24312B", // 深棕
  "#8B4513", // 马鞍棕
  "#4A6741", // 森林绿
  "#8B2252", // 深玫红
  "#CD853F", // 秘鲁金
  "#5F9EA0", // 蓝绿
] as const;

type MenuMode = "main" | "font" | "size" | "color";

/**
 * Apple 风格浮动上下文菜单 — 白底黑字。
 * 显示在选中文字元素上方，提供字体/字号/颜色快速切换。
 */
export function ElementContextMenu({
  visible,
  element,
  elementFrame,
  onChangeFont,
  onChangeSize,
  onChangeColor,
  onClose,
  initialMode,
}: ElementContextMenuProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [mode, setMode] = React.useState<MenuMode>(initialMode ?? "main");

  // 切换模式时重置
  React.useEffect(() => {
    if (!visible) {
      setMode("main");
    }
  }, [visible]);

  // 当 visible 变为 true 时，应用 initialMode
  React.useEffect(() => {
    if (visible && initialMode) {
      setMode(initialMode);
    }
  }, [visible, initialMode]);

  if (!visible || !elementFrame) {
    return null;
  }

  // 计算菜单位置：优先在元素上方，空间不足时放在下方
  const menuWidth = Math.min(windowWidth - 40, 340);
  const menuX = Math.max(20, Math.min(windowWidth - menuWidth - 20, elementFrame.x + elementFrame.width / 2 - menuWidth / 2));
  const aboveY = elementFrame.y - 12;
  const belowY = elementFrame.y + elementFrame.height + 12;
  const estimatedMenuHeight = mode === "color" ? 480 : mode === "main" ? 110 : 260;
  const menuY = aboveY - estimatedMenuHeight < 60 ? belowY : aboveY;

  const renderContent = () => {
    switch (mode) {
      case "font":
        return (
          <View style={styles.modePanel}>
            <View style={styles.modeHeader}>
              <Pressable onPress={() => setMode("main")} style={styles.backButton}>
                <Text style={styles.backText}>← 返回</Text>
              </Pressable>
              <Text style={styles.modeTitle}>选择字体</Text>
              <View style={styles.backButton} />
            </View>
            <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
              {canvasFonts.map((font) => (
                <Pressable
                  key={font.id}
                  onPress={() => {
                    onChangeFont(font.id);
                    setMode("main");
                  }}
                  style={[styles.listItem, element.fontStyle === font.id && styles.listItemActive]}>
                  <Text style={[styles.listItemText, { fontFamily: font.family }, element.fontStyle === font.id && styles.listItemTextActive]}>
                    {font.label}
                  </Text>
                  {element.fontStyle === font.id ? (
                    <Text style={styles.checkmark}>✓</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        );
      case "size":
        return (
          <View style={styles.modePanel}>
            <View style={styles.modeHeader}>
              <Pressable onPress={() => setMode("main")} style={styles.backButton}>
                <Text style={styles.backText}>← 返回</Text>
              </Pressable>
              <Text style={styles.modeTitle}>选择字号</Text>
              <View style={styles.backButton} />
            </View>
            <FontSizeSlider
              onChange={(size) => {
                onChangeSize(size);
                setMode("main");
              }}
              value={element.fontSize}
            />
          </View>
        );
      case "color":
        return (
          <View style={styles.modePanel}>
            <View style={styles.modeHeader}>
              <Pressable onPress={() => setMode("main")} style={styles.backButton}>
                <Text style={styles.backText}>← 返回</Text>
              </Pressable>
              <Text style={styles.modeTitle}>选择颜色</Text>
              <View style={styles.backButton} />
            </View>
            <ScrollView style={styles.colorScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.presetLabel}>推荐配色</Text>
              <View style={styles.presetGrid}>
                {presetColors.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => {
                      onChangeColor(color);
                      setMode("main");
                    }}
                    style={[styles.presetSwatch, { backgroundColor: color }, element.color === color && styles.presetSwatchActive]}>
                    {element.color === color ? <Text style={styles.presetCheck}>✓</Text> : null}
                  </Pressable>
                ))}
              </View>
              <Text style={styles.presetLabel}>自定义颜色</Text>
              <ColorPicker
                value={element.color}
                onChange={(hex) => onChangeColor(hex)}
              />
            </ScrollView>
          </View>
        );
      default:
        return (
          <View style={styles.mainMenu}>
            <MenuButton icon="𝔸" label="字体" onPress={() => setMode("font")} preview={canvasFonts.find((f) => f.id === element.fontStyle)?.label} />
            <MenuDivider />
            <MenuButton icon="↓" label="字号" onPress={() => setMode("size")} preview={`${element.fontSize}`} />
            <MenuDivider />
            <MenuButton
              icon="●"
              iconColor={element.color}
              label="颜色"
              onPress={() => setMode("color")}
              preview={<View style={[styles.colorPreview, { backgroundColor: element.color }]} />}
            />
          </View>
        );
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 半透明背景 —— 点击关闭 */}
      <Pressable
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        entering={FadeIn.duration(200).springify().damping(20)}
        exiting={FadeOut.duration(150)}
        style={[
          styles.menuContainer,
          { left: menuX, top: menuY, width: menuWidth },
        ]}>
        {renderContent()}
      </Animated.View>
    </View>
  );
}

function MenuButton({
  icon,
  iconColor,
  label,
  onPress,
  preview,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  onPress: () => void;
  preview?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuButton}>
      <View style={styles.menuButtonLeft}>
        <View style={[styles.menuIcon, iconColor ? { backgroundColor: iconColor + "18" } : undefined]}>
          <Text style={[styles.menuIconText, iconColor ? { color: iconColor } : undefined]}>{icon}</Text>
        </View>
        <Text style={styles.menuLabel}>{label}</Text>
      </View>
      <View style={styles.menuButtonRight}>
        {typeof preview === "string" ? (
          <Text style={styles.menuPreviewText}>{preview}</Text>
        ) : (
          preview
        )}
        <Text style={styles.menuChevron}>›</Text>
      </View>
    </Pressable>
  );
}

function MenuDivider() {
  return <View style={styles.divider} />;
}

/**
 * 字号选择器：进度条 + 数字输入框，范围 2–40。
 * 点击进度条任意位置跳转到对应字号，也可通过数字输入框直接键入。
 */
function FontSizeSlider({
  onChange,
  value,
}: {
  onChange: (size: number) => void;
  value: number;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const TRACK_WIDTH = Math.min(windowWidth - 100, 300);
  const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value));
  const fraction = (clamped - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN);
  const thumbLeft = fraction * (TRACK_WIDTH - 24);

  const onTrackPress = (event: { nativeEvent: { locationX: number } }) => {
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / TRACK_WIDTH));
    const size = Math.round(FONT_SIZE_MIN + ratio * (FONT_SIZE_MAX - FONT_SIZE_MIN));
    onChange(size);
  };

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.row}>
        <Text style={sliderStyles.valueLabel}>{clamped}</Text>
        <TextInput
          accessibilityLabel="输入字号"
          keyboardType="number-pad"
          onChangeText={(text) => {
            const n = parseInt(text, 10);
            if (!isNaN(n) && n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX) {
              onChange(n);
            }
          }}
          style={sliderStyles.numberInput}
          value={String(clamped)}
        />
      </View>
      <Pressable accessibilityRole="adjustable" onPress={onTrackPress} style={sliderStyles.sliderTrackWrapper}>
        <View style={[sliderStyles.sliderTrack, { width: TRACK_WIDTH }]}>
          <View style={[sliderStyles.sliderFill, { width: thumbLeft + 12 }]} />
        </View>
        <View style={[sliderStyles.sliderThumb, { transform: [{ translateX: thumbLeft }] }]} />
      </Pressable>
      <View style={sliderStyles.marksRow}>
        <Text style={sliderStyles.markText}>小 {FONT_SIZE_MIN}</Text>
        <Text style={sliderStyles.markText}>大 {FONT_SIZE_MAX}</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  valueLabel: {
    color: "#1C2C28",
    fontSize: 28,
    fontWeight: "800",
    minWidth: 48,
    textAlign: "center",
  },
  numberInput: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#1C2C28",
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: "center",
    width: 64,
  },
  sliderTrackWrapper: {
    alignItems: "center",
    position: "relative",
  },
  sliderTrack: {
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 4,
    height: 6,
    overflow: "hidden",
  },
  sliderFill: {
    backgroundColor: "#B76545",
    borderRadius: 4,
    height: "100%",
  },
  sliderThumb: {
    backgroundColor: "#FFFFFF",
    borderColor: "#B76545",
    borderRadius: 12,
    borderWidth: 2,
    elevation: 3,
    height: 24,
    left: 0,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    top: -9,
    width: 24,
  },
  marksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  markText: {
    color: "rgba(0,0,0,0.35)",
    fontSize: 11,
    fontWeight: "600",
  },
});

const styles = StyleSheet.create({
  menuContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 4,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    zIndex: 20000,
  },
  mainMenu: {
    paddingVertical: 4,
  },
  menuButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuButtonLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  menuIcon: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  menuIconText: {
    color: "#1C2C28",
    fontSize: 16,
    fontWeight: "700",
  },
  menuLabel: {
    color: "#1C2C28",
    fontSize: 16,
    fontWeight: "600",
  },
  menuButtonRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  menuPreviewText: {
    color: "rgba(0,0,0,0.45)",
    fontSize: 15,
  },
  menuChevron: {
    color: "rgba(0,0,0,0.25)",
    fontSize: 20,
    fontWeight: "300",
  },
  divider: {
    backgroundColor: "rgba(0,0,0,0.08)",
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  colorPreview: {
    borderRadius: 5,
    height: 20,
    width: 20,
  },
  // Mode panels
  modePanel: {
    maxHeight: 440,
  },
  modeHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(0,0,0,0.08)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    width: 60,
  },
  backText: {
    color: "rgba(0,0,0,0.45)",
    fontSize: 14,
    fontWeight: "600",
  },
  modeTitle: {
    color: "#1C2C28",
    fontSize: 15,
    fontWeight: "700",
  },
  listScroll: {
    maxHeight: 320,
    paddingHorizontal: 4,
  },
  listItem: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  listItemActive: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  listItemText: {
    color: "#1C2C28",
    fontSize: 16,
  },
  listItemTextActive: {
    fontWeight: "700",
  },
  checkmark: {
    color: "#B76545",
    fontSize: 16,
    fontWeight: "800",
  },
  colorScroll: {
    maxHeight: 400,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetLabel: {
    color: "rgba(0,0,0,0.45)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 8,
    textTransform: "uppercase",
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  presetSwatch: {
    alignItems: "center",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  presetSwatchActive: {
    borderColor: "#1C2C28",
    borderWidth: 2.5,
  },
  presetCheck: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
});
