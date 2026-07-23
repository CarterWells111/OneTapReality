import * as React from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";

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

type MarkerFrame = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type CityMarkerLayout = { readonly anchor: { readonly x: number; readonly y: number }; readonly pressFrame: MarkerFrame; readonly labelFrame: MarkerFrame; readonly markerFrame: MarkerFrame };
type MarkerPlacement = { readonly label: Omit<MarkerFrame, "x" | "y"> & { readonly offsetX: number; readonly offsetY: number }; readonly pressOffsetX: number; readonly pressOffsetY: number };

const markerPlacements: Record<City, MarkerPlacement> = {
  hangzhou: { label: { height: 20, offsetX: -76, offsetY: 28, width: 80 }, pressOffsetX: -37, pressOffsetY: -22 },
  shanghai: { label: { height: 20, offsetX: -8, offsetY: -48, width: 72 }, pressOffsetX: -7, pressOffsetY: -22 },
  shenzhen: { label: { height: 20, offsetX: -37, offsetY: 26, width: 74 }, pressOffsetX: -22, pressOffsetY: -22 },
};

export function resolveCityMarkerLayout(marker: CityMapMarker): CityMarkerLayout {
  const anchor = { x: marker.coordinate.x * overviewMapDimensions.width, y: marker.coordinate.y * overviewMapDimensions.height };
  const placement = markerPlacements[marker.city];
  const pressFrame = { height: markerTargetSize, width: markerTargetSize, x: anchor.x + placement.pressOffsetX, y: anchor.y + placement.pressOffsetY };
  return {
    anchor,
    labelFrame: { height: placement.label.height, width: placement.label.width, x: anchor.x + placement.label.offsetX, y: anchor.y + placement.label.offsetY },
    markerFrame: { height: markerVisualSize, width: markerVisualSize, x: anchor.x - markerVisualSize / 2, y: anchor.y - markerVisualSize / 2 },
    pressFrame,
  };
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

export function CityMap({ stats, variant, initialCity, focus, interactive = false, onCityPress }: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const [workspaceSize, setWorkspaceSize] = React.useState<WorkspaceSize>(overviewMapDimensions);
  const initialViewport = variant === "workspace"
    ? focusViewport(getWorkspaceFocus(adapter, initialCity, focus), workspaceSize)
    : { scale: 1, translateX: 0, translateY: 0 };
  const [viewport, setViewport] = React.useState<WorkspaceViewport>(initialViewport);
  const translateX = useSharedValue(initialViewport.translateX);
  const translateY = useSharedValue(initialViewport.translateY);
  const scale = useSharedValue(initialViewport.scale);
  const panStartX = useSharedValue(initialViewport.translateX);
  const panStartY = useSharedValue(initialViewport.translateY);
  const pinchStartScale = useSharedValue(initialViewport.scale);

  React.useEffect(() => {
    const nextViewport = variant === "workspace"
      ? focusViewport(getWorkspaceFocus(adapter, initialCity, focus), workspaceSize)
      : { scale: 1, translateX: 0, translateY: 0 };
    translateX.value = nextViewport.translateX;
    translateY.value = nextViewport.translateY;
    scale.value = nextViewport.scale;
    setViewport(nextViewport);
  }, [adapter, focus, initialCity, scale, translateX, translateY, variant, workspaceSize]);

  const updateViewport = React.useCallback((nextViewport: WorkspaceViewport) => {
    setViewport(clampWorkspaceViewport(nextViewport, workspaceSize));
  }, [workspaceSize]);
  const onWorkspaceLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    if (height <= 0 || width <= 0) return;
    setWorkspaceSize((current) => current.height === height && current.width === width ? current : { height, width });
  }, []);
  const pan = Gesture.Pan().enabled(variant === "workspace")
    .onBegin(() => { panStartX.value = translateX.value; panStartY.value = translateY.value; })
    .onUpdate((event) => {
      const next = clampWorkspaceViewport({ scale: scale.value, translateX: panStartX.value + event.translationX, translateY: panStartY.value + event.translationY }, workspaceSize);
      translateX.value = next.translateX;
      translateY.value = next.translateY;
      runOnJS(updateViewport)(next);
    });
  const pinch = Gesture.Pinch().enabled(variant === "workspace")
    .onBegin(() => { pinchStartScale.value = scale.value; })
    .onUpdate((event) => {
      const next = clampWorkspaceViewport({ scale: pinchStartScale.value * event.scale, translateX: translateX.value, translateY: translateY.value }, workspaceSize);
      scale.value = next.scale;
      translateX.value = next.translateX;
      translateY.value = next.translateY;
      runOnJS(updateViewport)(next);
    });
  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));
  const outlinePoints = adapter.outline.points.map(({ x, y }) => `${x * 300},${y * 210}`).join(" ");

  const map = (
    <View accessibilityLabel={variant === "overview" ? "离线中国城市旅行地图概览" : "离线中国城市旅行地图工作区"} onLayout={variant === "workspace" ? onWorkspaceLayout : undefined} style={{ aspectRatio: 300 / 210, backgroundColor: "#EEF2EE", borderRadius: 20, overflow: "hidden" }} testID={variant === "workspace" ? "city-map-workspace" : undefined}>
      <View testID={variant === "workspace" ? "city-map-workspace-canvas" : undefined} style={{ flex: 1, transform: [{ translateX: viewport.translateX }, { translateY: viewport.translateY }, { scale: viewport.scale }] }}>
        <Svg height="100%" width="100%" viewBox="0 0 300 210">
          <Polygon fill="#DDEBDD" points={outlinePoints} stroke={colors.accent} strokeWidth={2} />
        </Svg>
        {adapter.markers.map((marker) => {
          const { city, coordinate } = marker;
          const stat = statsByCity.get(city) ?? { city, visitCount: 0, unlocked: false, isVisited: false, intensity: "none" as const };
          const token = markerTokens[stat.intensity];
          const layout = resolveCityMarkerLayout(marker);
          const pressOffsetX = layout.pressFrame.x - layout.anchor.x;
          const pressOffsetY = layout.pressFrame.y - layout.anchor.y;
          const markerOffsetX = layout.markerFrame.x - layout.pressFrame.x;
          const markerOffsetY = layout.markerFrame.y - layout.pressFrame.y;
          return (
            <Pressable key={city} accessibilityLabel={savedMemoryLabel(city, stat.visitCount)} accessibilityRole="button" disabled={!interactive} onPress={() => onCityPress?.(city)} style={({ pressed }) => ({ height: markerTargetSize, left: `${coordinate.x * 100}%`, minHeight: markerTargetSize, minWidth: markerTargetSize, opacity: pressed ? 0.82 : 1, position: "absolute", top: `${coordinate.y * 100}%`, transform: [{ translateX: pressOffsetX }, { translateY: pressOffsetY }], width: markerTargetSize })} testID={`city-map-marker-${city}-${stat.intensity}`}>
              <View style={{ backgroundColor: token.fill, borderColor: token.border, borderRadius: markerVisualSize / 2, borderWidth: 3, height: markerVisualSize, left: markerOffsetX, position: "absolute", top: markerOffsetY, width: markerVisualSize }} />
              <Text selectable style={{ color: colors.ink, fontSize: 12, fontWeight: "800", left: layout.labelFrame.x - layout.pressFrame.x, position: "absolute", top: layout.labelFrame.y - layout.pressFrame.y, width: layout.labelFrame.width }}>{cityContent[city].name} · {stat.visitCount} 册</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
  return variant === "workspace" ? <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>{map}</GestureDetector> : map;
}

export type { CityMapProps, CityMapVariant };
