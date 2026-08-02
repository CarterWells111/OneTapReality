import * as React from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";

import { colors } from "../../components/ui";
import { headingFontFamily } from "../typography/fonts";
import type { City } from "../../types/memory";
import { cityContent } from "./city-content";
import { OfflineChinaMapAdapter, type CityMapFocus, type CityMapMarker } from "./city-map-adapter";
import type { CityStats, CityVisitIntensity } from "./city-stats";
import { clampWorkspaceViewport, resolveCityFocus, type WorkspaceSize, type WorkspaceViewport } from "./city-workspace";
import { chinaMapViewBox, chinaProvinces } from "./china-map-data";

type CityMapVariant = "overview" | "workspace";
type CityMapProps = {
  stats: readonly CityStats[];
  variant: CityMapVariant;
  initialCity?: City;
  focus?: CityMapFocus;
  interactive?: boolean;
  onCityPress?: (city: City) => void;
  onMapPress?: () => void;
  /** 设置目标城市后地图会以动画跳转并放大到该城市 */
  targetCity?: City;
  /** 跳转动画完成后的回调 */
  onTargetReached?: () => void;
};

const markerTokens: Record<CityVisitIntensity, { fill: string; border: string }> = {
  none: { fill: colors.surface, border: colors.line },
  light: { fill: colors.accentSoft, border: colors.accent },
  medium: { fill: colors.accentSoft, border: colors.warmAccent },
  strong: { fill: colors.warmAccent, border: colors.ink },
};
// 概览图尺寸与新版地图 viewBox（1000×1171）同比例，避免 letterbox 导致标记与点击区错位
const overviewMapDimensions = Object.freeze({ height: 351, width: 300 });
const markerTargetSize = 44;
const markerVisualSize = 8;
const markerLabelFontSize = 11;
const markerLabelWidth = 88;
const markerLabelHeight = 20;
export const workspaceLabelZoomThreshold = 1.8;
const minimumReadableMarkerSize = 12;
const chinaProvincesData = chinaProvinces as readonly { readonly id: string; readonly name: string; readonly path: string }[];

const [minX, minY, width, height] = chinaMapViewBox.split(/\s+/).map(Number);
export const chinaMapCoordinateSpace = Object.freeze({ height, minX, minY, width });
const markerSvgScale = chinaMapCoordinateSpace.height / overviewMapDimensions.height;
const markerSvgRadius = markerVisualSize * markerSvgScale / 2;
const markerTargetSvgSize = markerTargetSize * markerSvgScale;
const markerLabelSvgFontSize = markerLabelFontSize * markerSvgScale;
const markerLabelSvgOffsetY = (markerVisualSize / 2 + markerLabelFontSize) * markerSvgScale;
const markerLabelSvgWidth = markerLabelWidth * markerSvgScale;
const markerLabelCollisionPadding = 8;

type MarkerFrame = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type CityMarkerLayout = { readonly anchor: { readonly x: number; readonly y: number }; readonly pressFrame: MarkerFrame; readonly labelFrame: MarkerFrame; readonly markerFrame: MarkerFrame };
export function resolveCityMarkerLayout(marker: CityMapMarker): CityMarkerLayout {
  const anchor = { x: marker.coordinate.x * overviewMapDimensions.width, y: marker.coordinate.y * overviewMapDimensions.height };
  const pressFrame = { height: markerTargetSize, width: markerTargetSize, x: anchor.x - markerTargetSize / 2, y: anchor.y - markerTargetSize / 2 };
  return {
    anchor,
    labelFrame: { height: markerLabelHeight, width: markerLabelWidth, x: Math.min(Math.max(0, anchor.x - markerLabelWidth / 2), overviewMapDimensions.width - markerLabelWidth), y: Math.max(0, anchor.y - 30) },
    markerFrame: { height: markerVisualSize, width: markerVisualSize, x: anchor.x - markerVisualSize / 2, y: anchor.y - markerVisualSize / 2 },
    pressFrame,
  };
}

export function resolveChinaMapCoordinate(marker: CityMapMarker) {
  "worklet";
  return {
    x: chinaMapCoordinateSpace.minX + marker.coordinate.x * chinaMapCoordinateSpace.width,
    y: chinaMapCoordinateSpace.minY + marker.coordinate.y * chinaMapCoordinateSpace.height,
  };
}

/** 城市标记在新地图坐标系中的位置（新版数据直接以 0..1 归一化坐标给出）。 */
function resolveMarkerSvgCoordinate(marker: CityMapMarker) {
  "worklet";
  return {
    x: marker.coordinate.x * chinaMapCoordinateSpace.width,
    y: marker.coordinate.y * chinaMapCoordinateSpace.height,
  };
}

export function resolveChinaMapContentFrame(size: WorkspaceSize) {
  "worklet";
  const scale = Math.min(size.width / chinaMapCoordinateSpace.width, size.height / chinaMapCoordinateSpace.height);
  const mapWidth = chinaMapCoordinateSpace.width * scale;
  const mapHeight = chinaMapCoordinateSpace.height * scale;
  return { height: mapHeight, scale, width: mapWidth, x: (size.width - mapWidth) / 2, y: (size.height - mapHeight) / 2 };
}

type WorkspaceMarkerModel = {
  readonly dotSize: number;
  readonly fontSize: number;
  readonly onScreen: boolean;
  readonly pressSize: number;
  readonly showLabel: boolean;
};

type WorkspaceMarkerCandidate = {
  readonly labelFrame: MarkerFrame;
  readonly model: WorkspaceMarkerModel;
};

function labelFramesIntersect(first: MarkerFrame, second: MarkerFrame) {
  "worklet";
  return first.x < second.x + second.width + markerLabelCollisionPadding
    && first.x + first.width + markerLabelCollisionPadding > second.x
    && first.y < second.y + second.height + markerLabelCollisionPadding
    && first.y + first.height + markerLabelCollisionPadding > second.y;
}

function resolveWorkspaceMarkerCandidate(marker: CityMapMarker, viewport: WorkspaceViewport, size: WorkspaceSize): WorkspaceMarkerCandidate {
  "worklet";
  const contentFrame = resolveChinaMapContentFrame(size);
  const renderScale = contentFrame.scale * viewport.scale;
  const dotSize = markerSvgRadius * 2 * renderScale;
  const pressSize = markerTargetSvgSize * renderScale;
  const fontSize = markerLabelSvgFontSize * renderScale;
  const coordinate = resolveMarkerSvgCoordinate(marker);
  const contentX = contentFrame.x + (coordinate.x - chinaMapCoordinateSpace.minX) * contentFrame.scale;
  const contentY = contentFrame.y + (coordinate.y - chinaMapCoordinateSpace.minY) * contentFrame.scale;
  const anchorX = (contentX - size.width / 2) * viewport.scale + size.width / 2 + viewport.translateX;
  const anchorY = (contentY - size.height / 2) * viewport.scale + size.height / 2 + viewport.translateY;
  const onScreen = anchorX + dotSize / 2 >= 0 && anchorX - dotSize / 2 <= size.width && anchorY + dotSize / 2 >= 0 && anchorY - dotSize / 2 <= size.height;
  const labelFrame = {
    height: fontSize * 1.25,
    width: markerLabelSvgWidth * renderScale,
    x: anchorX - markerLabelSvgWidth * renderScale / 2,
    y: anchorY - markerLabelSvgOffsetY * renderScale - fontSize,
  };
  const labelOnScreen = labelFrame.x + labelFrame.width >= 0 && labelFrame.x <= size.width && labelFrame.y + labelFrame.height >= 0 && labelFrame.y <= size.height;
  const showLabel = viewport.scale >= workspaceLabelZoomThreshold && dotSize >= minimumReadableMarkerSize && onScreen && labelOnScreen;
  return { labelFrame, model: { dotSize, fontSize, onScreen, pressSize, showLabel } };
}

export function resolveWorkspaceMarkerModel(marker: CityMapMarker, viewport: WorkspaceViewport, size: WorkspaceSize): WorkspaceMarkerModel {
  "worklet";
  return resolveWorkspaceMarkerCandidate(marker, viewport, size).model;
}

export function resolveWorkspaceMarkerModels(markers: readonly CityMapMarker[], viewport: WorkspaceViewport, size: WorkspaceSize): WorkspaceMarkerModel[] {
  "worklet";
  const visibleLabelFrames: MarkerFrame[] = [];
  return markers.map((marker) => {
    const candidate = resolveWorkspaceMarkerCandidate(marker, viewport, size);
    if (!candidate.model.showLabel || visibleLabelFrames.some((frame) => labelFramesIntersect(frame, candidate.labelFrame))) {
      return {
        dotSize: candidate.model.dotSize,
        fontSize: candidate.model.fontSize,
        onScreen: candidate.model.onScreen,
        pressSize: candidate.model.pressSize,
        showLabel: false,
      };
    }
    visibleLabelFrames.push(candidate.labelFrame);
    return candidate.model;
  });
}

function resolveVisibleWorkspaceLabelCities(markers: readonly CityMapMarker[], viewport: WorkspaceViewport, size: WorkspaceSize): City[] {
  const models = resolveWorkspaceMarkerModels(markers, viewport, size);
  return markers.flatMap((marker, index) => models[index]?.showLabel ? [marker.city] : []);
}

export type { CityMapProps, CityMapVariant };

function savedMemoryLabel(city: City, visitCount: number) {
  return `${cityContent[city].name}，已保存 ${visitCount} 册旅行记忆`;
}

function focusViewport(focus: CityMapFocus, size: WorkspaceSize): WorkspaceViewport {
  // focus.center 是地图相对坐标（0..1）。考虑容器 letterbox（地图居中、按比例缩放），
  // 把中心点映射到实际屏幕位置后计算平移量，保证目标城市位于视口中心。
  const contentFrame = resolveChinaMapContentFrame(size);
  const centerX = contentFrame.x + focus.center.x * contentFrame.width;
  const centerY = contentFrame.y + focus.center.y * contentFrame.height;
  return clampWorkspaceViewport({
    scale: focus.zoom,
    translateX: (0.5 - centerX / size.width) * size.width * focus.zoom,
    translateY: (0.5 - centerY / size.height) * size.height * focus.zoom,
  }, size);
}

function getWorkspaceFocus(adapter: OfflineChinaMapAdapter, initialCity: City | undefined, focus: CityMapFocus | undefined) {
  return focus ?? (initialCity ? resolveCityFocus(adapter, initialCity) : adapter.initialFocus);
}

export function getCityMapTransform(viewport: WorkspaceViewport) {
  "worklet";
  return [
    { translateX: viewport.translateX },
    { translateY: viewport.translateY },
    { scale: viewport.scale },
  ];
}

/**
 * 在 UI 线程上实时计算单个标记点的屏幕坐标（不含 React 状态依赖）。
 * 这是消除标记点拖动延迟的关键：使用 shared values 直接参与动画计算。
 */
function computeMarkerScreenPosition(
  marker: CityMapMarker,
  viewport: WorkspaceViewport,
  size: WorkspaceSize,
): { x: number; y: number } {
  "worklet";
  if (size.width <= 0 || size.height <= 0) return { x: 0, y: 0 };
  const contentFrame = resolveChinaMapContentFrame(size);
  const coordinate = resolveMarkerSvgCoordinate(marker);
  const baseX = contentFrame.x + (coordinate.x - chinaMapCoordinateSpace.minX) * contentFrame.scale;
  const baseY = contentFrame.y + (coordinate.y - chinaMapCoordinateSpace.minY) * contentFrame.scale;
  return {
    x: (baseX - size.width / 2) * viewport.scale + size.width / 2 + viewport.translateX,
    y: (baseY - size.height / 2) * viewport.scale + size.height / 2 + viewport.translateY,
  };
}

// ─── Overview ────────────────────────────────────────────────────────

function OverviewCityMap({ stats, interactive = false, onCityPress, onMapPress }: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));

  return (
    <View accessibilityLabel="离线中国城市旅行地图概览" style={{ aspectRatio: overviewMapDimensions.width / overviewMapDimensions.height, backgroundColor: colors.accentSoft, borderRadius: 20, overflow: "hidden" }}>
      <Svg height="100%" preserveAspectRatio="xMidYMid meet" testID="city-map-content" width="100%" viewBox={chinaMapViewBox}>
        {chinaProvincesData.map((province) => (
          <Path
            key={province.id}
            d={province.path}
            fill={colors.paper}
            onPress={onMapPress}
            stroke={colors.accent}
            strokeWidth={0.8}
            testID={`china-province-${province.id}`}
          />
        ))}
        {/* 台湾省界已包含在数据中，无需手绘插画 */}
        {adapter.markers.map((marker) => {
          const { city } = marker;
          const stat = statsByCity.get(city) ?? { city, visitCount: 0, unlocked: false, isVisited: false, intensity: "none" as const };
          const token = markerTokens[stat.intensity];
          const coordinate = resolveChinaMapCoordinate(marker);
          return (
            <G key={city} testID={`city-map-marker-${city}-${stat.intensity}`}>
              <Circle cx={coordinate.x} cy={coordinate.y} fill={token.fill} r={markerSvgRadius} stroke={token.border} strokeWidth={2 * markerSvgScale} />
            </G>
          );
        })}
      </Svg>

      {/* 标记点的可点击覆盖层 — 为每个城市标记提供无障碍按压目标 */}
      {adapter.markers.map((marker) => {
        const { city } = marker;
        const stat = statsByCity.get(city) ?? { city, visitCount: 0, unlocked: false, isVisited: false, intensity: "none" as const };
        const layout = resolveCityMarkerLayout(marker);
        return (
          <Pressable
            accessibilityLabel={savedMemoryLabel(city, stat.visitCount)}
            accessibilityRole="button"
            key={`${city}-target`}
            onPress={interactive ? () => onCityPress?.(city) : undefined}
            style={({ pressed }) => ({
              height: layout.pressFrame.height,
              left: layout.pressFrame.x,
              opacity: pressed ? 0.82 : 1,
              position: "absolute",
              top: layout.pressFrame.y,
              width: layout.pressFrame.width,
            })}
            testID={`city-map-marker-target-${city}-${stat.intensity}`}
          />
        );
      })}

      {onMapPress ? (
        <Pressable
          accessibilityLabel="全屏查看中国地图"
          accessibilityRole="button"
          onPress={onMapPress}
          style={({ pressed }) => ({ backgroundColor: colors.surface, borderColor: colors.accent, borderRadius: 16, borderWidth: 1, bottom: 12, opacity: pressed ? 0.82 : 1, paddingHorizontal: 12, paddingVertical: 8, position: "absolute", right: 12 })}
        >
          <Text selectable style={{ color: colors.accent, fontSize: 13, fontWeight: "800" }}>全屏查看</Text>
        </Pressable>
      ) : null}
      <Text selectable style={{ bottom: 10, color: colors.muted, fontSize: 10, left: 12, position: "absolute" }}>China provincial map · CC BY 4.0</Text>
    </View>
  );
}

// ─── Workspace Animated Marker ──────────────────────────────────────

const MARKER_DOT_SIZE = 8;
const MARKER_LABEL_FONT_SIZE = 11;
const MARKER_BASE_TARGET = 44;

type AnimatedMarkerProps = {
  marker: CityMapMarker;
  stat: CityStats;
  showLabel: boolean;
  interactive: boolean;
  onCityPress?: (city: City) => void;
  translateX: { value: number };
  translateY: { value: number };
  scale: { value: number };
  mapWidth: { value: number };
  mapHeight: { value: number };
};

/**
 * 单个工作区标记点组件 — 使用 useAnimatedStyle 在 UI 线程实时计算位置，
 * 消除与地图 SVG 之间的拖动延迟。
 */
function AnimatedWorkspaceMarker({
  marker, stat, showLabel, interactive, onCityPress,
  translateX, translateY, scale, mapWidth, mapHeight,
}: AnimatedMarkerProps) {
  const token = markerTokens[stat.intensity];

  const animatedStyle = useAnimatedStyle(() => {
    const size: WorkspaceSize = { height: mapHeight.value, width: mapWidth.value };
    const viewport: WorkspaceViewport = { scale: scale.value, translateX: translateX.value, translateY: translateY.value };
    const pos = computeMarkerScreenPosition(marker, viewport, size);

    // 点击热区固定 44px：不随缩放放大，避免高倍率下互相遮挡导致误点
    const hitSize = MARKER_BASE_TARGET;

    return {
      height: hitSize,
      left: pos.x - hitSize / 2,
      top: pos.y - hitSize / 2,
      width: hitSize,
    };
  });

  const animatedDotStyle = useAnimatedStyle(() => {
    const size: WorkspaceSize = { height: mapHeight.value, width: mapWidth.value };
    const viewport: WorkspaceViewport = { scale: scale.value, translateX: translateX.value, translateY: translateY.value };
    const contentFrame = resolveChinaMapContentFrame(size);
    const dotRenderSize = Math.max(4, MARKER_DOT_SIZE * contentFrame.scale * viewport.scale);
    return {
      borderRadius: dotRenderSize / 2,
      height: dotRenderSize,
      width: dotRenderSize,
    };
  });

  return (
    <Animated.View
      accessible={false}
      style={[{ alignItems: "center", justifyContent: "center", position: "absolute" }, animatedStyle]}
      testID={`city-map-marker-dot-${marker.city}-${stat.intensity}`}
    >
      <Pressable
        accessibilityLabel={savedMemoryLabel(marker.city, stat.visitCount)}
        accessibilityRole="button"
        onPress={interactive ? () => onCityPress?.(marker.city) : undefined}
        style={({ pressed }) => ({
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <Animated.View style={[{
          backgroundColor: token.fill,
          borderColor: token.border,
          borderWidth: 1.5,
        }, animatedDotStyle]} />
        {showLabel ? (
          <Text
            style={{
              color: colors.ink,
              fontFamily: headingFontFamily,
              fontSize: MARKER_LABEL_FONT_SIZE,
              fontWeight: "800",
              position: "absolute",
              textAlign: "center",
              top: -MARKER_LABEL_FONT_SIZE - 4,
              width: 88,
            }}
            testID={`city-map-label-${marker.city}`}
          >
            {cityContent[marker.city].name}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// ─── Workspace ──────────────────────────────────────────────────────

function WorkspaceCityMap({ stats, variant, initialCity, focus, interactive = false, onCityPress, onMapPress, targetCity, onTargetReached }: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const [workspaceSize, setWorkspaceSize] = React.useState<WorkspaceSize>(overviewMapDimensions);
  const initialViewport = variant === "workspace"
    ? focusViewport(getWorkspaceFocus(adapter, initialCity, focus), workspaceSize)
    : { scale: 1, translateX: 0, translateY: 0 };
  const translateX = useSharedValue(initialViewport.translateX);
  const translateY = useSharedValue(initialViewport.translateY);
  const sc = useSharedValue(initialViewport.scale);
  const panStartX = useSharedValue(initialViewport.translateX);
  const panStartY = useSharedValue(initialViewport.translateY);
  const pinchStartScale = useSharedValue(initialViewport.scale);
  const mapWidth = useSharedValue(workspaceSize.width);
  const mapHeight = useSharedValue(workspaceSize.height);
  const [visibleLabelCities, setVisibleLabelCities] = React.useState<readonly City[]>(() => resolveVisibleWorkspaceLabelCities(adapter.markers, initialViewport, workspaceSize));
  const animatingRef = React.useRef(false);

  const updateState = React.useCallback((next: WorkspaceViewport, size: WorkspaceSize) => {
    setVisibleLabelCities(resolveVisibleWorkspaceLabelCities(adapter.markers, next, size));
  }, [adapter]);

  // targetCity 跳转动画
  // shared values (translateX, translateY, sc) 是稳定 ref，不需要作为 deps
  React.useEffect(() => {
    if (!targetCity || workspaceSize.width <= 0 || workspaceSize.height <= 0) return;
    const cityFocus = adapter.cityFocus[targetCity];
    if (!cityFocus) return;
    const nextViewport = focusViewport(cityFocus, workspaceSize);
    animatingRef.current = true;
    translateX.value = withTiming(nextViewport.translateX, { duration: 500 });
    translateY.value = withTiming(nextViewport.translateY, { duration: 500 });
    sc.value = withTiming(nextViewport.scale, { duration: 500 }, () => {
      animatingRef.current = false;
      runOnJS(updateState)(nextViewport, workspaceSize);
      if (onTargetReached) runOnJS(onTargetReached)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCity]);

  React.useEffect(() => {
    const nextViewport = variant === "workspace"
      ? focusViewport(getWorkspaceFocus(adapter, initialCity, focus), workspaceSize)
      : { scale: 1, translateX: 0, translateY: 0 };
    translateX.value = nextViewport.translateX;
    translateY.value = nextViewport.translateY;
    sc.value = nextViewport.scale;
    updateState(nextViewport, workspaceSize);
  }, [adapter, focus, initialCity, sc, translateX, translateY, updateState, variant, workspaceSize]);

  const onWorkspaceLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { height: h, width: w } = event.nativeEvent.layout;
    if (h <= 0 || w <= 0) return;
    mapWidth.value = w;
    mapHeight.value = h;
    setWorkspaceSize((current) => current.height === h && current.width === w ? current : { height: h, width: w });
  }, [mapHeight, mapWidth]);

  const pan = Gesture.Pan().enabled(variant === "workspace")
    .onBegin(() => { panStartX.value = translateX.value; panStartY.value = translateY.value; })
    .onUpdate((event) => {
      const next = clampWorkspaceViewport({ scale: sc.value, translateX: panStartX.value + event.translationX, translateY: panStartY.value + event.translationY }, { height: mapHeight.value, width: mapWidth.value });
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    })
    .onFinalize(() => {
      const next = clampWorkspaceViewport({ scale: sc.value, translateX: translateX.value, translateY: translateY.value }, { height: mapHeight.value, width: mapWidth.value });
      translateX.value = next.translateX;
      translateY.value = next.translateY;
      runOnJS(updateState)(next, { height: mapHeight.value, width: mapWidth.value });
    });

  const pinch = Gesture.Pinch().enabled(variant === "workspace")
    .onBegin(() => { pinchStartScale.value = sc.value; })
    .onUpdate((event) => {
      const next = clampWorkspaceViewport({ scale: pinchStartScale.value * event.scale, translateX: translateX.value, translateY: translateY.value }, { height: mapHeight.value, width: mapWidth.value });
      sc.value = next.scale;
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    })
    .onFinalize(() => {
      const next = clampWorkspaceViewport({ scale: sc.value, translateX: translateX.value, translateY: translateY.value }, { height: mapHeight.value, width: mapWidth.value });
      sc.value = next.scale;
      translateX.value = next.translateX;
      translateY.value = next.translateY;
      runOnJS(updateState)(next, { height: mapHeight.value, width: mapWidth.value });
    });

  // 双击放大（在捏合/平移之外补充点击缩放入口，模拟器与无触控板设备可用）
  const doubleTap = Gesture.Tap()
    .enabled(variant === "workspace")
    .numberOfTaps(2)
    .maxDelay(280)
    .onEnd((event, success) => {
      if (!success) return;
      const size = { height: mapHeight.value, width: mapWidth.value };
      const currentScale = sc.value;
      const nextScale = currentScale >= 2.4 ? 1 : Math.min(3.5, currentScale * 2);
      // 以双击点为中心缩放（手指位置保持在地图上的同一点）
      const scaleRatio = nextScale / currentScale;
      const nextTranslateX = event.x - (event.x - translateX.value) * scaleRatio;
      const nextTranslateY = event.y - (event.y - translateY.value) * scaleRatio;
      const next = clampWorkspaceViewport({ scale: nextScale, translateX: nextTranslateX, translateY: nextTranslateY }, size);
      translateX.value = withTiming(next.translateX, { duration: 200 });
      translateY.value = withTiming(next.translateY, { duration: 200 });
      sc.value = withTiming(next.scale, { duration: 200 });
      runOnJS(updateState)(next, size);
    });

  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));
  const animatedCanvasStyle = useAnimatedStyle(() => ({
    transform: getCityMapTransform({ scale: sc.value, translateX: translateX.value, translateY: translateY.value }),
  }));

  // 共享值引用（只读传递，在 AnimatedWorkspaceMarker 中通过 useAnimatedStyle 消耗）
  const sharedValues = React.useMemo(() => ({
    mapHeight, mapWidth, scale: sc, translateX, translateY,
  }), [mapHeight, mapWidth, sc, translateX, translateY]);

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, doubleTap)}>
      <View accessibilityLabel="离线中国城市旅行地图工作区" onLayout={onWorkspaceLayout} style={{ backgroundColor: colors.accentSoft, borderRadius: 16, flex: 1, overflow: "hidden", width: "100%" }} testID="city-map-workspace">
        {/* 省份地图层：缩放跟随视口 */}
        <Animated.View pointerEvents="none" testID="city-map-workspace-canvas" style={[StyleSheet.absoluteFill, animatedCanvasStyle]}>
          <Svg height="100%" preserveAspectRatio="xMidYMid meet" testID="city-map-content" width="100%" viewBox={chinaMapViewBox}>
            {chinaProvincesData.map((province) => (
              <Path
                key={province.id}
                d={province.path}
                fill={colors.paper}
                stroke={colors.accent}
                strokeWidth={0.8}
                testID={`china-province-${province.id}`}
              />
            ))}
          </Svg>
        </Animated.View>

        {/* 标记点层：Animated.View + useAnimatedStyle → 实时跟随手势，零延迟。
            按城市屏幕 y 坐标升序渲染（上方标记在上层），避免下方标记热区遮挡上方点击。 */}
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {[...adapter.markers]
            .sort((left, right) => left.coordinate.y - right.coordinate.y)
            .map((marker) => {
            const stat = statsByCity.get(marker.city) ?? { city: marker.city, visitCount: 0, unlocked: false, isVisited: false, intensity: "none" as const };
            const showLabel = visibleLabelCities.includes(marker.city);
            return (
              <AnimatedWorkspaceMarker
                interactive={interactive}
                key={marker.city}
                mapHeight={sharedValues.mapHeight}
                mapWidth={sharedValues.mapWidth}
                marker={marker}
                onCityPress={onCityPress}
                scale={sharedValues.scale}
                showLabel={showLabel}
                stat={stat}
                translateX={sharedValues.translateX}
                translateY={sharedValues.translateY}
              />
            );
          })}
        </View>

        <Text selectable style={{ bottom: 10, color: colors.muted, fontSize: 10, left: 12, position: "absolute" }}>China provincial map · CC BY 4.0</Text>
      </View>
    </GestureDetector>
  );
}

// ─── Public API ─────────────────────────────────────────────────────

export function CityMap(props: CityMapProps) {
  return props.variant === "overview" ? <OverviewCityMap {...props} /> : <WorkspaceCityMap {...props} />;
}
