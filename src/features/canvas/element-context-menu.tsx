import * as React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
};

const fontSizes = [12, 14, 16, 18, 20, 22, 24, 28, 34] as const;

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
 * Apple 风格浮动上下文菜单。
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
}: ElementContextMenuProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [mode, setMode] = React.useState<MenuMode>("main");

  // 切换模式时重置
  React.useEffect(() => {
    if (!visible) {
      setMode("main");
    }
  }, [visible]);

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
            <View style={styles.sizeGrid}>
              {fontSizes.map((size) => (
                <Pressable
                  key={size}
                  onPress={() => {
                    onChangeSize(size);
                    setMode("main");
                  }}
                  style={[styles.sizeItem, element.fontSize === size && styles.sizeItemActive]}>
                  <Text style={[styles.sizeItemText, element.fontSize === size && styles.sizeItemTextActive]}>
                    {size}
                  </Text>
                </Pressable>
              ))}
            </View>
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
        <View style={[styles.menuIcon, iconColor ? { backgroundColor: iconColor + "20" } : undefined]}>
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

const styles = StyleSheet.create({
  menuContainer: {
    backgroundColor: "rgba(28, 28, 30, 0.96)",
    borderRadius: 16,
    paddingVertical: 4,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.4,
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
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  menuIconText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  menuLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  menuButtonRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  menuPreviewText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
  },
  menuChevron: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 20,
    fontWeight: "300",
  },
  divider: {
    backgroundColor: "rgba(255,255,255,0.1)",
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
    borderBottomColor: "rgba(255,255,255,0.1)",
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
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "600",
  },
  modeTitle: {
    color: "#FFFFFF",
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
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  listItemText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  listItemTextActive: {
    fontWeight: "700",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  sizeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    padding: 16,
  },
  sizeItem: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    width: 60,
  },
  sizeItemActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  sizeItemText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  sizeItemTextActive: {
    fontWeight: "800",
  },
  colorScroll: {
    maxHeight: 400,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetLabel: {
    color: "rgba(255,255,255,0.6)",
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
    borderColor: "#FFFFFF",
    borderWidth: 2.5,
  },
  presetCheck: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
});
