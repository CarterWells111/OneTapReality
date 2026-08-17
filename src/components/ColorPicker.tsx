import * as React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { colors } from "./ui";

// RNGH 的 simultaneousWithExternalGesture 接受任意原生组件引用；
// 运行时即 ScrollView 原生滚动手势，类型上以 unknown 桥接。

// ---------------------------------------------------------------------------
// 色空间转换工具
// ---------------------------------------------------------------------------

type RGB = { r: number; g: number; b: number };
type HSV = { h: number; s: number; v: number };

/** HSV → RGB（h: 0‑360, s: 0‑1, v: 0‑1）。 */
export function hsvToRgb({ h, s, v }: HSV): RGB {
  "worklet";
  const c = v * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp < 1) {
    rp = c;
    gp = x;
  } else if (hp < 2) {
    rp = x;
    gp = c;
  } else if (hp < 3) {
    gp = c;
    bp = x;
  } else if (hp < 4) {
    gp = x;
    bp = c;
  } else if (hp < 5) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

/** RGB → HSV。 */
export function rgbToHsv({ r, g, b }: RGB): HSV {
  "worklet";
  const rp = r / 255;
  const gp = g / 255;
  const bp = b / 255;
  const cmax = Math.max(rp, gp, bp);
  const cmin = Math.min(rp, gp, bp);
  const delta = cmax - cmin;
  let h = 0;
  if (delta !== 0) {
    if (cmax === rp) {
      h = 60 * (((gp - bp) / delta) % 6);
    } else if (cmax === gp) {
      h = 60 * ((bp - rp) / delta + 2);
    } else {
      h = 60 * ((rp - gp) / delta + 4);
    }
  }
  if (h < 0) h += 360;
  const s = cmax === 0 ? 0 : delta / cmax;
  const v = cmax;
  return { h, s, v };
}

/** 六位 HEX → RGB。 */
export function hexToRgb(hex: string): RGB {
  "worklet";
  const clean = hex.replace(/^#/, "");
  const full = clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean;
  const n = parseInt(full, 16);
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
  };
}

/** RGB → 六位 HEX。 */
export function rgbToHex({ r, g, b }: RGB): string {
  "worklet";
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hsvToHex(hsv: HSV): string {
  "worklet";
  return rgbToHex(hsvToRgb(hsv));
}

// ---------------------------------------------------------------------------
// 色盘组件
// ---------------------------------------------------------------------------

type ColorPickerProps = {
  /** 当前 Hex 颜色值 */
  value: string;
  /** 连续手势被系统取消时通知调用方，不提交页面数据。 */
  onCancel?: () => void;
  /** 连续手势结束或离散输入完成时提交一次。 */
  onCommit: (hex: string) => void;
  /** 可选外部共享值：连续手势仅在 UI 线程更新它。 */
  previewValue?: SharedValue<string>;
  /**
  /**
   * 外层滚动容器的引用：传入后色盘手势与滚动共存（色盘内拖动色相/明度
   * 不会被滚动抢占；不传则色盘手势独立，如创建页全屏弹层）。
   */
  scrollRef?: React.RefObject<unknown>;
};

const SV_SIZE = 200;
const HUE_BAR_WIDTH = 280;
const HUE_BAR_HEIGHT = 22;
const THUMB = 26;
const RING = 3;

/**
 * 苹果风格 HSV 色盘。
 *
 * 提供饱和度‑明度方块 + 色相条 + RGB 数值输入 + 十六进制输入 +
 * 大块颜色预览。所有转换在 UI 线程执行，无桥接延迟。
 */
const VALID_HEX = /^#[0-9A-F]{6}$/i;

function normalizeHex(value: string) {
  return value.toUpperCase();
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function ColorPicker({ value, onCancel, onCommit, previewValue, scrollRef }: ColorPickerProps) {
  const safeValue = VALID_HEX.test(value) ? normalizeHex(value) : "#000000";
  const currentRgb = hexToRgb(safeValue);
  const currentHsv = rgbToHsv(currentRgb);
  const commitRef = React.useRef(onCommit);
  commitRef.current = onCommit;
  const cancelRef = React.useRef(onCancel);
  cancelRef.current = onCancel;

  const hue = useSharedValue(currentHsv.h);
  const saturation = useSharedValue(currentHsv.s);
  const brightness = useSharedValue(currentHsv.v);
  const localPreviewValue = useSharedValue(safeValue);
  const localPreviewRef = React.useRef(localPreviewValue);
  const stablePreviewValue = previewValue ?? localPreviewRef.current;
  const gestureStartValue = useSharedValue(safeValue);
  const gestureStartRef = React.useRef(gestureStartValue);
  const stableGestureStart = gestureStartRef.current;
  const [rgbDraft, setRgbDraft] = React.useState(() => ({
    b: String(currentRgb.b),
    g: String(currentRgb.g),
    r: String(currentRgb.r),
  }));
  const [hexDraft, setHexDraft] = React.useState(safeValue);
  const submittedRgbRef = React.useRef<Partial<Record<keyof RGB, boolean>>>({});
  const submittedHexRef = React.useRef(false);

  // RNGH 类型只接受其内部手势/组件引用，无法表达 ScrollView 实例；
  // 运行时即原生滚动手势（官方推荐用法），此处仅做类型桥接。
  const externalScrollRef = scrollRef
    ? (scrollRef as React.RefObject<React.ComponentType | undefined>)
    : undefined;

  // 响应外部 value 变化（例如点击预设色块后）
  React.useEffect(() => {
    const nextRgb = hexToRgb(safeValue);
    const next = rgbToHsv(nextRgb);
    hue.value = next.h;
    saturation.value = next.s;
    brightness.value = next.v;
    stablePreviewValue.value = safeValue;
  }, [safeValue, hue, saturation, brightness, stablePreviewValue]);

  React.useEffect(() => {
    const nextRgb = hexToRgb(safeValue);
    setRgbDraft({ b: String(nextRgb.b), g: String(nextRgb.g), r: String(nextRgb.r) });
    setHexDraft(safeValue);
  }, [safeValue]);

  // 布局引用 —— 在 UI 线程测量后写入
  const svLayout = useSharedValue({ x: 0, y: 0, w: SV_SIZE, h: SV_SIZE });
  const hueLayout = useSharedValue({ x: 0, w: HUE_BAR_WIDTH });

  const emitCommit = React.useCallback((hex: string) => {
    if (VALID_HEX.test(hex)) {
      commitRef.current(normalizeHex(hex));
    }
  }, []);
  const emitCancel = React.useCallback(() => {
    cancelRef.current?.();
  }, []);

  // ---- SV 方块手势 ----
  // 在 ScrollView 内时与滚动共存：色盘上的拖动归色盘，色盘外的滚动归滚动。
  const svPan = externalScrollRef
    ? Gesture.Pan().simultaneousWithExternalGesture(externalScrollRef)
    : Gesture.Pan();
  svPan
    .onBegin((e) => {
      stableGestureStart.value = stablePreviewValue.value;
      const layout = svLayout.value;
      const sx = Math.max(0, Math.min(1, e.x / layout.w));
      const sy = Math.max(0, Math.min(1, 1 - e.y / layout.h));
      saturation.value = sx;
      brightness.value = sy;
      stablePreviewValue.value = hsvToHex({ h: hue.value, s: sx, v: sy });
    })
    .onChange((e) => {
      const layout = svLayout.value;
      const sx = Math.max(0, Math.min(1, e.x / layout.w));
      const sy = Math.max(0, Math.min(1, 1 - e.y / layout.h));
      saturation.value = sx;
      brightness.value = sy;
      stablePreviewValue.value = hsvToHex({ h: hue.value, s: sx, v: sy });
    })
    .onFinalize((_event, success) => {
      if (success === false) {
        const restored = rgbToHsv(hexToRgb(stableGestureStart.value));
        hue.value = restored.h;
        saturation.value = restored.s;
        brightness.value = restored.v;
        stablePreviewValue.value = stableGestureStart.value;
        runOnJS(emitCancel)();
        return;
      }
      runOnJS(emitCommit)(hsvToHex({ h: hue.value, s: saturation.value, v: brightness.value }));
    });

  // ---- Hue 条手势 ----
  const huePan = externalScrollRef
    ? Gesture.Pan().simultaneousWithExternalGesture(externalScrollRef)
    : Gesture.Pan();
  huePan
    .onBegin((e) => {
      stableGestureStart.value = stablePreviewValue.value;
      const layout = hueLayout.value;
      const hx = Math.max(0, Math.min(360, (e.x / layout.w) * 360));
      hue.value = hx;
      stablePreviewValue.value = hsvToHex({ h: hx, s: saturation.value, v: brightness.value });
    })
    .onChange((e) => {
      const layout = hueLayout.value;
      const hx = Math.max(0, Math.min(360, (e.x / layout.w) * 360));
      hue.value = hx;
      stablePreviewValue.value = hsvToHex({ h: hx, s: saturation.value, v: brightness.value });
    })
    .onFinalize((_event, success) => {
      if (success === false) {
        const restored = rgbToHsv(hexToRgb(stableGestureStart.value));
        hue.value = restored.h;
        saturation.value = restored.s;
        brightness.value = restored.v;
        stablePreviewValue.value = stableGestureStart.value;
        runOnJS(emitCancel)();
        return;
      }
      runOnJS(emitCommit)(hsvToHex({ h: hue.value, s: saturation.value, v: brightness.value }));
    });

  // ---- 动画样式（UI 线程） ----
  const svThumbStyle = useAnimatedStyle(() => {
    const layout = svLayout.value;
    return {
      left: saturation.value * layout.w - THUMB / 2,
      top: (1 - brightness.value) * layout.h - THUMB / 2,
      backgroundColor: hsvToHex({ h: hue.value, s: saturation.value, v: brightness.value }),
    };
  });

  const hueThumbStyle = useAnimatedStyle(() => {
    const layout = hueLayout.value;
    return {
      left: (hue.value / 360) * layout.w - THUMB / 2,
      backgroundColor: hsvToHex({ h: hue.value, s: 1, v: 1 }),
    };
  });

  const hueColorProps = useAnimatedProps(() => ({
    fill: hsvToHex({ h: hue.value, s: 1, v: 1 }),
  }));

  const previewStyle = useAnimatedStyle(() => ({
    backgroundColor: stablePreviewValue.value,
  }));

  // ---- RGB / Hex 输入 ----
  const commitRgb = (ch: keyof RGB, source: "blur" | "submit") => {
    if (source === "blur" && submittedRgbRef.current[ch]) {
      submittedRgbRef.current[ch] = false;
      return;
    }
    submittedRgbRef.current[ch] = source === "submit";
    const parsed = Number(rgbDraft[ch]);
    if (!Number.isFinite(parsed) || rgbDraft[ch].trim() === "") {
      setRgbDraft((current) => ({ ...current, [ch]: String(currentRgb[ch]) }));
      return;
    }
    const num = Math.max(0, Math.min(255, Math.round(parsed)));
    const next = { ...currentRgb, [ch]: num };
    const nextHex = rgbToHex(next);
    stablePreviewValue.value = nextHex;
    emitCommit(nextHex);
    setRgbDraft((current) => ({ ...current, [ch]: String(num) }));
  };

  const commitHex = (source: "blur" | "submit") => {
    if (source === "blur" && submittedHexRef.current) {
      submittedHexRef.current = false;
      return;
    }
    submittedHexRef.current = source === "submit";
    const clean = hexDraft.startsWith("#") ? hexDraft : `#${hexDraft}`;
    if (!VALID_HEX.test(clean)) {
      setHexDraft(safeValue);
      return;
    }
    const normalized = normalizeHex(clean);
    setHexDraft(normalized);
    stablePreviewValue.value = normalized;
    emitCommit(normalized);
  };

  return (
    <View style={styles.container}>
      {/* ── 饱和度·明度方块 ── */}
      <View style={styles.svContainer}>
        <View
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            svLayout.value = { x: 0, y: 0, w: width, h: height };
          }}
        >
          <Svg height={SV_SIZE} width={SV_SIZE}>
            <Defs>
              {/* 水平：白 → 透明（控制饱和度） */}
              <LinearGradient id="sv-white" x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
              {/* 垂直：透明 → 黑（控制明度） */}
              <LinearGradient id="sv-black" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <AnimatedRect animatedProps={hueColorProps} height={SV_SIZE} width={SV_SIZE} rx={12} />
            <Rect fill="url(#sv-white)" height={SV_SIZE} width={SV_SIZE} rx={12} />
            <Rect fill="url(#sv-black)" height={SV_SIZE} width={SV_SIZE} rx={12} />
          </Svg>
        </View>
        <GestureDetector gesture={svPan}>
          <View style={styles.gestureOverlay} />
        </GestureDetector>
        <Animated.View pointerEvents="none" style={[styles.thumb, svThumbStyle]} />
      </View>

      {/* ── 色相条 ── */}
      <View style={styles.hueContainer}>
        <View
          onLayout={(e) => {
            const { width } = e.nativeEvent.layout;
            hueLayout.value = { x: 0, w: width };
          }}
        >
          <Svg height={HUE_BAR_HEIGHT} width={HUE_BAR_WIDTH}>
            <Defs>
              <LinearGradient id="hue-grad" x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0%" stopColor="#FF0000" />
                <Stop offset="17%" stopColor="#FFFF00" />
                <Stop offset="33%" stopColor="#00FF00" />
                <Stop offset="50%" stopColor="#00FFFF" />
                <Stop offset="67%" stopColor="#0000FF" />
                <Stop offset="83%" stopColor="#FF00FF" />
                <Stop offset="100%" stopColor="#FF0000" />
              </LinearGradient>
            </Defs>
            <Rect
              fill="url(#hue-grad)"
              height={HUE_BAR_HEIGHT}
              rx={HUE_BAR_HEIGHT / 2}
              width={HUE_BAR_WIDTH}
            />
          </Svg>
        </View>
        <GestureDetector gesture={huePan}>
          <View style={styles.gestureOverlay} />
        </GestureDetector>
        <Animated.View pointerEvents="none" style={[styles.thumb, styles.hueThumb, hueThumbStyle]} />
      </View>

      {/* ── RGB 输入 ── */}
      <View style={styles.rgbRow}>
        {(["r", "g", "b"] as const).map((ch) => (
          <View key={ch} style={styles.rgbCell}>
            <Text style={styles.rgbLabel}>{ch.toUpperCase()}</Text>
            <TextInput
              accessibilityLabel={`颜色分量 ${ch.toUpperCase()}`}
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={3}
              onBlur={() => commitRgb(ch, "blur")}
              onChangeText={(text) => {
                if (/^\d*$/.test(text)) {
                  submittedRgbRef.current[ch] = false;
                  setRgbDraft((current) => ({ ...current, [ch]: text }));
                }
              }}
              onSubmitEditing={() => commitRgb(ch, "submit")}
              selectTextOnFocus
              style={styles.rgbField}
              value={rgbDraft[ch]}
            />
          </View>
        ))}
      </View>

      {/* ── Hex + 预览 ── */}
      <View style={styles.hexRow}>
        <Animated.View style={[styles.previewBlock, previewStyle]} />
        <TextInput
          accessibilityLabel="十六进制颜色值"
          autoCapitalize="none"
          maxLength={7}
          onBlur={() => commitHex("blur")}
          onChangeText={(next) => {
            const clean = next.startsWith("#") ? next : `#${next}`;
            if (/^#[0-9A-F]{0,6}$/i.test(clean)) {
              submittedHexRef.current = false;
              setHexDraft(clean.toUpperCase());
            }
          }}
          onSubmitEditing={() => commitHex("submit")}
          selectTextOnFocus
          style={styles.hexField}
          value={hexDraft}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 14,
    width: "100%",
  },

  // SV square
  svContainer: {
    borderRadius: 12,
    height: SV_SIZE,
    overflow: "hidden",
    position: "relative",
    width: SV_SIZE,
  },

  // Hue bar
  hueContainer: {
    borderRadius: HUE_BAR_HEIGHT / 2,
    height: HUE_BAR_HEIGHT,
    overflow: "visible",
    position: "relative",
    width: HUE_BAR_WIDTH,
  },

  // Shared thumb
  thumb: {
    borderColor: "#FFFFFF",
    borderRadius: THUMB / 2,
    borderWidth: RING,
    elevation: 5,
    height: THUMB,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    width: THUMB,
  },
  hueThumb: {
    top: -(THUMB - HUE_BAR_HEIGHT) / 2,
  },

  // Transparent gesture overlay
  gestureOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  // RGB
  rgbRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
  },
  rgbCell: {
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  rgbLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  rgbField: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    paddingHorizontal: 6,
    paddingVertical: 7,
    textAlign: "center",
    width: "100%",
  },

  // Hex + preview
  hexRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  previewBlock: {
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    width: 44,
  },
  hexField: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    minHeight: 44,
    paddingHorizontal: 12,
  },
});
