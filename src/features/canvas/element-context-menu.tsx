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
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { canvasFonts } from "./canvas-assets";
import { ColorPicker } from "../../components/ColorPicker";
import { useFontLoading } from "../typography/font-loading-provider";
import type { CanvasTextElement } from "../../types/memory";

type ElementContextMenuProps = {
  visible: boolean;
  element: CanvasTextElement;
  elementFrame: { x: number; y: number; width: number; height: number } | null;
  onChangeFont: (fontStyle: string) => void;
  onChangeSize: (fontSize: number) => void;
  onFontSizeDraftChange?: (fontSize: number | undefined) => void;
  onCancelSize?: () => void;
  fontSizePreview?: SharedValue<number>;
  onChangeColor: (color: string) => void;
  onColorDraftChange?: (color: string | undefined) => void;
  onCancelColor?: () => void;
  colorPreview?: SharedValue<string>;
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

/** 面板模式。菜单没有主面板：工具栏按钮直达对应子面板，点击遮罩关闭。 */
type MenuMode = "font" | "size" | "color";

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
  onFontSizeDraftChange,
  onCancelSize,
  fontSizePreview,
  onChangeColor,
  onColorDraftChange,
  onCancelColor,
  colorPreview,
  onClose,
  initialMode,
}: ElementContextMenuProps) {
  const { requestFont, resolveFontFamily } = useFontLoading();
  const { width: windowWidth } = useWindowDimensions();
  const [mode, setMode] = React.useState<MenuMode>(initialMode ?? "font");
  // 颜色面板的滚动容器引用：传给 ColorPicker 使色盘手势与滚动共存
  const colorScrollRef = React.useRef<ScrollView>(null);

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
  const estimatedMenuHeight = mode === "color" ? 480 : 260;
  const menuY = aboveY - estimatedMenuHeight < 60 ? belowY : aboveY;

  const renderContent = () => {
    switch (mode) {
      case "font":
        return (
          <View style={styles.modePanel}>
            <View style={styles.modeHeader}>
              <Text style={styles.modeTitle}>选择字体</Text>
            </View>
            <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
              {canvasFonts.map((font) => (
                <Pressable
                  key={font.id}
                  onPress={() => {
                    requestFont(font.id, true);
                    onChangeFont(font.id);
                    onClose();
                  }}
                  style={[styles.listItem, element.fontStyle === font.id && styles.listItemActive]}>
                  <Text style={[styles.listItemText, { fontFamily: resolveFontFamily(font.id) }, element.fontStyle === font.id && styles.listItemTextActive]}>
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
              <Text style={styles.modeTitle}>选择字号</Text>
            </View>
            <FontSizeSlider
              onCancel={onCancelSize}
              onChange={onChangeSize}
              onDraftChange={onFontSizeDraftChange}
              previewValue={fontSizePreview}
              value={element.fontSize}
            />
          </View>
        );
      case "color":
        return (
          <View style={styles.modePanel}>
            <View style={styles.modeHeader}>
              <Text style={styles.modeTitle}>选择颜色</Text>
            </View>
            <ScrollView ref={colorScrollRef} style={styles.colorScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.presetLabel}>推荐配色</Text>
              <View style={styles.presetGrid}>
                {presetColors.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => {
                      onChangeColor(color);
                      onClose();
                    }}
                    style={[styles.presetSwatch, { backgroundColor: color }, element.color === color && styles.presetSwatchActive]}>
                    {element.color === color ? <Text style={styles.presetCheck}>✓</Text> : null}
                  </Pressable>
                ))}
              </View>
              <Text style={styles.presetLabel}>自定义颜色</Text>
              <ColorPicker
                onCancel={onCancelColor}
                onDraftChange={onColorDraftChange}
                scrollRef={colorScrollRef}
                value={element.color}
                onCommit={onChangeColor}
                previewValue={colorPreview}
              />
            </ScrollView>
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
        testID="context-menu-backdrop"
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

/**
 * 字号选择器：可拖动进度条 + 数字输入框，范围 2–40。
 * - 拖动/点击进度条实时应用字号（不关闭菜单）。
 * - 数字输入：本地 draft 状态，输入时只改草稿，失焦时校验并提交。
 */
function FontSizeSlider({
  onCancel,
  onChange,
  onDraftChange,
  previewValue,
  value,
}: {
  onCancel?: () => void;
  onChange: (size: number) => void;
  onDraftChange?: (size: number | undefined) => void;
  previewValue?: SharedValue<number>;
  value: number;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const TRACK_WIDTH = Math.min(windowWidth - 100, 300);
  const clamped = Number.isFinite(value)
    ? Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value))
    : FONT_SIZE_MIN;
  // 数字输入的本地草稿：输入过程中不被外部 value 重置
  const [draft, setDraft] = React.useState(String(clamped));
  const changeRef = React.useRef(onChange);
  changeRef.current = onChange;
  const cancelRef = React.useRef(onCancel);
  cancelRef.current = onCancel;
  const draftChangeRef = React.useRef(onDraftChange);
  draftChangeRef.current = onDraftChange;
  const localPreviewValue = useSharedValue(clamped);
  const localPreviewRef = React.useRef(localPreviewValue);
  const stablePreviewValue = previewValue ?? localPreviewRef.current;
  const gestureStartValue = useSharedValue(clamped);
  const gestureStartRef = React.useRef(gestureStartValue);
  const stableGestureStart = gestureStartRef.current;
  const submittedDraftRef = React.useRef(false);

  // 外部变化（拖动进度条）同步到草稿
  React.useEffect(() => {
    setDraft(String(clamped));
    stablePreviewValue.value = clamped;
  }, [clamped, stablePreviewValue]);

  const emitGestureCommit = React.useCallback((size: number) => {
    if (Number.isFinite(size) && size >= FONT_SIZE_MIN && size <= FONT_SIZE_MAX) {
      changeRef.current(size);
    }
  }, []);
  const emitGestureCancel = React.useCallback(() => {
    cancelRef.current?.();
  }, []);

  const previewPosition = (positionX: number) => {
    "worklet";
    const ratio = Math.max(0, Math.min(1, positionX / TRACK_WIDTH));
    const size = Math.round(FONT_SIZE_MIN + ratio * (FONT_SIZE_MAX - FONT_SIZE_MIN));
    stablePreviewValue.value = size;
  };

  const pan = Gesture.Pan()
    .onBegin((event) => {
      stableGestureStart.value = stablePreviewValue.value;
      previewPosition(event.x);
    })
    .onUpdate((event) => {
      previewPosition(event.x);
    })
    .onFinalize((_event, success) => {
      if (success === false) {
        stablePreviewValue.value = stableGestureStart.value;
        runOnJS(emitGestureCancel)();
        return;
      }
      runOnJS(emitGestureCommit)(stablePreviewValue.value);
    });

  const fillStyle = useAnimatedStyle(() => {
    const ratio = (stablePreviewValue.value - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN);
    return { width: Math.max(0, Math.min(1, ratio)) * (TRACK_WIDTH - 24) + 12 };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const ratio = (stablePreviewValue.value - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN);
    return { transform: [{ translateX: Math.max(0, Math.min(1, ratio)) * (TRACK_WIDTH - 24) }] };
  });

  const commitDraft = (source: "blur" | "submit") => {
    if (source === "blur" && submittedDraftRef.current) {
      submittedDraftRef.current = false;
      return;
    }
    submittedDraftRef.current = source === "submit";
    const parsed = parseInt(draft, 10);
    if (!Number.isNaN(parsed)) {
      const size = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, parsed));
      stablePreviewValue.value = size;
      changeRef.current(size);
      setDraft(String(size));
    } else {
      setDraft(String(clamped));
    }
  };

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.row}>
        <Text style={sliderStyles.valueLabel}>{clamped}</Text>
        <TextInput
          accessibilityLabel="输入字号"
          keyboardType="number-pad"
          maxLength={2}
          onBlur={() => commitDraft("blur")}
          onChangeText={(text) => {
            if (/^\d*$/.test(text)) {
              submittedDraftRef.current = false;
              setDraft(text);
              const parsed = Number(text);
              draftChangeRef.current?.(
                text.trim() !== ""
                && Number.isInteger(parsed)
                && parsed >= FONT_SIZE_MIN
                && parsed <= FONT_SIZE_MAX
                  ? parsed
                  : undefined,
              );
            }
          }}
          onSubmitEditing={() => commitDraft("submit")}
          selectTextOnFocus
          style={sliderStyles.numberInput}
          value={draft}
        />
      </View>
      <GestureDetector gesture={pan}>
        <View
          accessibilityLabel="字号进度条"
          accessibilityRole="adjustable"
          style={sliderStyles.sliderTrackWrapper}
          testID="font-size-slider">
          <View style={[sliderStyles.sliderTrack, { width: TRACK_WIDTH }]}>
            <Animated.View style={[sliderStyles.sliderFill, fillStyle]} />
          </View>
          <Animated.View style={[sliderStyles.sliderThumb, thumbStyle]} />
        </View>
      </GestureDetector>
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
  // Mode panels
  modePanel: {
    maxHeight: 440,
  },
  modeHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(0,0,0,0.08)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
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
