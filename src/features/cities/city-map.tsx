import * as React from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import chinaMap from "@svg-maps/china";

import { colors } from "../../components/ui";
import type { City } from "../../types/memory";
import { cityContent } from "./city-content";
import { OfflineChinaMapAdapter, type CityMapFocus, type CityMapMarker } from "./city-map-adapter";
import type { CityStats, CityVisitIntensity } from "./city-stats";
import { clampWorkspaceViewport, resolveCityFocus, type WorkspaceSize, type WorkspaceViewport } from "./city-workspace";

type CityMapVariant = "overview" | "workspace";
type CityMapProps = {
  stats: readonly CityStats[];
  variant: CityMapVariant;
  initialCity?: City;
  focus?: CityMapFocus;
  interactive?: boolean;
  onCityPress?: (city: City) => void;
  onMapPress?: () => void;
};

const markerTokens: Record<CityVisitIntensity, { fill: string; border: string }> = {
  none: { fill: colors.surface, border: colors.line },
  light: { fill: colors.accentSoft, border: colors.accent },
  medium: { fill: "#E8C98A", border: colors.warmAccent },
  strong: { fill: colors.warmAccent, border: colors.ink },
};
const overviewMapDimensions = Object.freeze({ height: 210, width: 300 });
const markerTargetSize = 44;
const markerVisualSize = 14;
const markerLabelFontSize = 12;
const markerLabelWidth = 88;
const markerLabelHeight = 20;
export const workspaceLabelZoomThreshold = 1.8;
const minimumReadableMarkerSize = 24;
const chinaMapViewBox = chinaMap.viewBox;
type ChinaProvince = { readonly id: string; readonly path: string };
const chinaProvinces = chinaMap.locations as readonly ChinaProvince[];

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

type WorkspaceMarkerModel = {
  readonly dotSize: number;
  readonly fontSize: number;
  readonly onScreen: boolean;
  readonly pressSize: number;
  readonly showLabel: boolean;
};
type WorkspaceLabelFrame = { readonly height: number; readonly width: number; readonly x: number; readonly y: number };

function labelFramesIntersect(first: WorkspaceLabelFrame, second: WorkspaceLabelFrame) {
  "worklet";
  return first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y;
}

export function resolveWorkspaceMarkerModels(markers: readonly CityMapMarker[], viewport: WorkspaceViewport, size: WorkspaceSize): WorkspaceMarkerModel[] {
  "worklet";
  const models: WorkspaceMarkerModel[] = [];
  const visibleLabelFrames: WorkspaceLabelFrame[] = [];
  const dotSize = markerVisualSize * viewport.scale;
  const pressSize = markerTargetSize * viewport.scale;
  const fontSize = markerLabelFontSize * viewport.scale;

  for (const marker of markers) {
    const anchorX = (marker.coordinate.x * size.width - size.width / 2) * viewport.scale + size.width / 2 + viewport.translateX;
    const anchorY = (marker.coordinate.y * size.height - size.height / 2) * viewport.scale + size.height / 2 + viewport.translateY;
    const onScreen = anchorX + dotSize / 2 >= 0 && anchorX - dotSize / 2 <= size.width && anchorY + dotSize / 2 >= 0 && anchorY - dotSize / 2 <= size.height;
    const labelFrame = { height: markerLabelHeight * viewport.scale, width: markerLabelWidth * viewport.scale, x: anchorX - markerLabelWidth * viewport.scale / 2, y: anchorY - 30 * viewport.scale };
    let collides = false;
    for (const visibleLabelFrame of visibleLabelFrames) {
      if (labelFramesIntersect(labelFrame, visibleLabelFrame)) {
        collides = true;
        break;
      }
    }
    const showLabel = viewport.scale >= workspaceLabelZoomThreshold && dotSize >= minimumReadableMarkerSize && onScreen && !collides;
    if (showLabel) visibleLabelFrames.push(labelFrame);
    models.push({ dotSize, fontSize, onScreen, pressSize, showLabel });
  }
  return models;
}

function savedMemoryLabel(city: City, visitCount: number) {
  return `${cityContent[city].name}，已保存 ${visitCount} 册旅行记忆`;
}

function focusViewport(focus: CityMapFocus, size: WorkspaceSize): WorkspaceViewport {
  return clampWorkspaceViewport({
    scale: focus.zoom,
    translateX: (0.5 - focus.center.x) * size.width * focus.zoom,
    translateY: (0.5 - focus.center.y) * size.height * focus.zoom,
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

type AnimatedWorkspaceValues = {
  readonly mapHeight: { readonly value: number };
  readonly mapWidth: { readonly value: number };
  readonly scale: { readonly value: number };
  readonly translateX: { readonly value: number };
  readonly translateY: { readonly value: number };
};

function CityMapMarkerView({ animatedValues, city, interactive, marker, markers, onCityPress, stat, variant }: {
  readonly animatedValues: AnimatedWorkspaceValues;
  readonly city: City;
  readonly interactive: boolean;
  readonly marker: CityMapMarker;
  readonly markers: readonly CityMapMarker[];
  readonly onCityPress?: (city: City) => void;
  readonly stat: CityStats;
  readonly variant: CityMapVariant;
}) {
  const token = markerTokens[stat.intensity];
  const layout = resolveCityMarkerLayout(marker);
  const pressOffsetX = layout.pressFrame.x - layout.anchor.x;
  const pressOffsetY = layout.pressFrame.y - layout.anchor.y;
  const markerOffsetX = layout.markerFrame.x - layout.pressFrame.x;
  const markerOffsetY = layout.markerFrame.y - layout.pressFrame.y;
  const animatedLabelStyle = useAnimatedStyle(() => {
    if (variant !== "workspace") return { opacity: 0 };
    const models = resolveWorkspaceMarkerModels(markers, {
      scale: animatedValues.scale.value,
      translateX: animatedValues.translateX.value,
      translateY: animatedValues.translateY.value,
    }, { height: animatedValues.mapHeight.value, width: animatedValues.mapWidth.value });
    const markerIndex = markers.indexOf(marker);
    return { opacity: models[markerIndex]?.showLabel ? 1 : 0 };
  });

  return (
    <Pressable accessibilityLabel={savedMemoryLabel(city, stat.visitCount)} accessibilityRole="button" disabled={!interactive} onPress={() => onCityPress?.(city)} style={({ pressed }) => ({ height: markerTargetSize, left: `${marker.coordinate.x * 100}%`, minHeight: markerTargetSize, minWidth: markerTargetSize, opacity: pressed ? 0.82 : 1, position: "absolute", top: `${marker.coordinate.y * 100}%`, transform: [{ translateX: pressOffsetX }, { translateY: pressOffsetY }], width: markerTargetSize })} testID={`city-map-marker-${city}-${stat.intensity}`}>
      <View style={{ backgroundColor: token.fill, borderColor: token.border, borderRadius: markerVisualSize / 2, borderWidth: 3, height: markerVisualSize, left: markerOffsetX, position: "absolute", top: markerOffsetY, width: markerVisualSize }} />
      {variant === "workspace" ? <Animated.View style={[{ left: markerTargetSize / 2 - markerLabelWidth / 2, position: "absolute", top: -8, width: markerLabelWidth }, animatedLabelStyle]}><Text selectable style={{ color: colors.ink, fontSize: markerLabelFontSize, fontWeight: "800" }}>{cityContent[city].name}</Text></Animated.View> : null}
    </Pressable>
  );
}

export function CityMap({ stats, variant, initialCity, focus, interactive = false, onCityPress, onMapPress }: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const [workspaceSize, setWorkspaceSize] = React.useState<WorkspaceSize>(overviewMapDimensions);
  const initialViewport = variant === "workspace"
    ? focusViewport(getWorkspaceFocus(adapter, initialCity, focus), workspaceSize)
    : { scale: 1, translateX: 0, translateY: 0 };
  const translateX = useSharedValue(initialViewport.translateX);
  const translateY = useSharedValue(initialViewport.translateY);
  const scale = useSharedValue(initialViewport.scale);
  const panStartX = useSharedValue(initialViewport.translateX);
  const panStartY = useSharedValue(initialViewport.translateY);
  const pinchStartScale = useSharedValue(initialViewport.scale);
  const mapWidth = useSharedValue(workspaceSize.width);
  const mapHeight = useSharedValue(workspaceSize.height);

  React.useEffect(() => {
    const nextViewport = variant === "workspace"
      ? focusViewport(getWorkspaceFocus(adapter, initialCity, focus), workspaceSize)
      : { scale: 1, translateX: 0, translateY: 0 };
    translateX.value = nextViewport.translateX;
    translateY.value = nextViewport.translateY;
    scale.value = nextViewport.scale;
  }, [adapter, focus, initialCity, scale, translateX, translateY, variant, workspaceSize]);

  const onWorkspaceLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    if (height <= 0 || width <= 0) return;
    mapWidth.value = width;
    mapHeight.value = height;
    setWorkspaceSize((current) => current.height === height && current.width === width ? current : { height, width });
  }, [mapHeight, mapWidth]);
  const pan = Gesture.Pan().enabled(variant === "workspace")
    .onBegin(() => { panStartX.value = translateX.value; panStartY.value = translateY.value; })
    .onUpdate((event) => {
      const next = clampWorkspaceViewport({ scale: scale.value, translateX: panStartX.value + event.translationX, translateY: panStartY.value + event.translationY }, { height: mapHeight.value, width: mapWidth.value });
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    })
    .onFinalize(() => {
      const next = clampWorkspaceViewport({ scale: scale.value, translateX: translateX.value, translateY: translateY.value }, { height: mapHeight.value, width: mapWidth.value });
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    });
  const pinch = Gesture.Pinch().enabled(variant === "workspace")
    .onBegin(() => { pinchStartScale.value = scale.value; })
    .onUpdate((event) => {
      const next = clampWorkspaceViewport({ scale: pinchStartScale.value * event.scale, translateX: translateX.value, translateY: translateY.value }, { height: mapHeight.value, width: mapWidth.value });
      scale.value = next.scale;
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    })
    .onFinalize(() => {
      const next = clampWorkspaceViewport({ scale: scale.value, translateX: translateX.value, translateY: translateY.value }, { height: mapHeight.value, width: mapWidth.value });
      scale.value = next.scale;
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    });
  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));
  const animatedCanvasStyle = useAnimatedStyle(() => ({
    transform: getCityMapTransform({ scale: scale.value, translateX: translateX.value, translateY: translateY.value }),
  }));

  const map = (
    <View accessibilityLabel={variant === "overview" ? "离线中国城市旅行地图概览" : "离线中国城市旅行地图工作区"} onLayout={variant === "workspace" ? onWorkspaceLayout : undefined} style={variant === "workspace" ? { backgroundColor: "#EEF2EE", borderRadius: 16, flex: 1, overflow: "hidden", width: "100%" } : { aspectRatio: 300 / 210, backgroundColor: "#EEF2EE", borderRadius: 20, overflow: "hidden" }} testID={variant === "workspace" ? "city-map-workspace" : undefined}>
      <Animated.View testID={variant === "workspace" ? "city-map-workspace-canvas" : undefined} style={[{ flex: 1 }, animatedCanvasStyle]}>
        <Svg height="100%" width="100%" viewBox={chinaMapViewBox}>
          {chinaProvinces.map((province) => (
            <Path
              key={province.id}
              d={province.path}
              fill="#DDEBDD"
              onPress={variant === "overview" ? onMapPress : undefined}
              stroke={colors.accent}
              strokeWidth={0.8}
              testID={`china-province-${province.id}`}
            />
          ))}
        </Svg>
        {adapter.markers.map((marker) => {
          const { city } = marker;
          const stat = statsByCity.get(city) ?? { city, visitCount: 0, unlocked: false, isVisited: false, intensity: "none" as const };
          return (
            <CityMapMarkerView animatedValues={{ mapHeight, mapWidth, scale, translateX, translateY }} city={city} interactive={interactive} key={city} marker={marker} markers={adapter.markers} onCityPress={onCityPress} stat={stat} variant={variant} />
          );
        })}
      </Animated.View>
      {variant === "overview" && onMapPress ? (
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
  return variant === "workspace" ? <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>{map}</GestureDetector> : map;
}

export type { CityMapProps, CityMapVariant };
