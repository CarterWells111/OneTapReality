import * as React from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
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
const markerVisualSize = 8;
const markerLabelFontSize = 11;
const markerLabelWidth = 88;
const markerLabelHeight = 20;
export const workspaceLabelZoomThreshold = 1.8;
const minimumReadableMarkerSize = 12;
const chinaMapViewBox = chinaMap.viewBox;
type ChinaProvince = { readonly id: string; readonly path: string };
const chinaProvinces = chinaMap.locations as readonly ChinaProvince[];
const taiwanInsetPath = "M 622 454 C 628 449 635 453 637 462 C 640 471 637 482 632 491 C 627 499 621 496 618 487 C 616 477 618 464 622 454 Z";
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

export function resolveChinaMapContentFrame(size: WorkspaceSize) {
  "worklet";
  const scale = Math.min(size.width / chinaMapCoordinateSpace.width, size.height / chinaMapCoordinateSpace.height);
  const width = chinaMapCoordinateSpace.width * scale;
  const height = chinaMapCoordinateSpace.height * scale;
  return { height, scale, width, x: (size.width - width) / 2, y: (size.height - height) / 2 };
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
  const coordinate = resolveChinaMapCoordinate(marker);
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

function CityMapMarkerView({ city, interactive, marker, onCityPress, stat, visibleLabelCities }: {
  readonly city: City;
  readonly interactive: boolean;
  readonly marker: CityMapMarker;
  readonly onCityPress?: (city: City) => void;
  readonly stat: CityStats;
  readonly visibleLabelCities: readonly City[];
}) {
  const token = markerTokens[stat.intensity];
  const coordinate = resolveChinaMapCoordinate(marker);

  return (
    <G accessibilityLabel={savedMemoryLabel(city, stat.visitCount)} accessibilityRole="button" accessible onPress={interactive ? () => onCityPress?.(city) : undefined} testID={`city-map-marker-${city}-${stat.intensity}`}>
      <Rect fill="transparent" height={markerTargetSvgSize} width={markerTargetSvgSize} x={coordinate.x - markerTargetSvgSize / 2} y={coordinate.y - markerTargetSvgSize / 2} testID={`city-map-marker-target-${city}-${stat.intensity}`} />
      <Circle cx={coordinate.x} cy={coordinate.y} fill={token.fill} r={markerSvgRadius} stroke={token.border} strokeWidth={2 * markerSvgScale} testID={`city-map-marker-dot-${city}-${stat.intensity}`} />
      {visibleLabelCities.includes(city) ? <SvgText fill={colors.ink} fontSize={markerLabelSvgFontSize} fontWeight="800" textAnchor="middle" x={coordinate.x} y={coordinate.y - markerLabelSvgOffsetY} testID={`city-map-label-${city}`}>{cityContent[city].name}</SvgText> : null}
    </G>
  );
}

function StaticCityMapMarkerView({ city, interactive, marker, onCityPress, stat }: {
  readonly city: City;
  readonly interactive: boolean;
  readonly marker: CityMapMarker;
  readonly onCityPress?: (city: City) => void;
  readonly stat: CityStats;
}) {
  const token = markerTokens[stat.intensity];
  const coordinate = resolveChinaMapCoordinate(marker);

  return (
    <G accessibilityLabel={savedMemoryLabel(city, stat.visitCount)} accessibilityRole="button" accessible onPress={interactive ? () => onCityPress?.(city) : undefined} testID={`city-map-marker-${city}-${stat.intensity}`}>
      <Rect fill="transparent" height={markerTargetSvgSize} width={markerTargetSvgSize} x={coordinate.x - markerTargetSvgSize / 2} y={coordinate.y - markerTargetSvgSize / 2} testID={`city-map-marker-target-${city}-${stat.intensity}`} />
      <Circle cx={coordinate.x} cy={coordinate.y} fill={token.fill} r={markerSvgRadius} stroke={token.border} strokeWidth={2 * markerSvgScale} testID={`city-map-marker-dot-${city}-${stat.intensity}`} />
    </G>
  );
}

function OverviewCityMap({ stats, interactive = false, onCityPress, onMapPress }: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));

  return (
    <View accessibilityLabel="离线中国城市旅行地图概览" style={{ aspectRatio: 300 / 210, backgroundColor: "#EEF2EE", borderRadius: 20, overflow: "hidden" }}>
      <Svg height="100%" preserveAspectRatio="xMidYMid meet" testID="city-map-content" width="100%" viewBox={chinaMapViewBox}>
        {chinaProvinces.map((province) => (
          <Path
            key={province.id}
            d={province.path}
            fill="#DDEBDD"
            onPress={onMapPress}
            stroke={colors.accent}
            strokeWidth={0.8}
            testID={`china-province-${province.id}`}
          />
        ))}
        <Path d={taiwanInsetPath} fill="#DDEBDD" stroke={colors.accent} strokeWidth={0.8} testID="china-province-taiwan-inset" />
        {adapter.markers.map((marker) => {
          const { city } = marker;
          const stat = statsByCity.get(city) ?? { city, visitCount: 0, unlocked: false, isVisited: false, intensity: "none" as const };
          return <StaticCityMapMarkerView city={city} interactive={interactive} key={city} marker={marker} onCityPress={onCityPress} stat={stat} />;
        })}
      </Svg>
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

function WorkspaceCityMap({ stats, variant, initialCity, focus, interactive = false, onCityPress, onMapPress }: CityMapProps) {
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
  const [visibleLabelCities, setVisibleLabelCities] = React.useState<readonly City[]>(() => resolveVisibleWorkspaceLabelCities(adapter.markers, initialViewport, workspaceSize));
  const updateVisibleLabelCities = React.useCallback((viewport: WorkspaceViewport, size: WorkspaceSize) => {
    setVisibleLabelCities(resolveVisibleWorkspaceLabelCities(adapter.markers, viewport, size));
  }, [adapter]);

  React.useEffect(() => {
    const nextViewport = variant === "workspace"
      ? focusViewport(getWorkspaceFocus(adapter, initialCity, focus), workspaceSize)
      : { scale: 1, translateX: 0, translateY: 0 };
    translateX.value = nextViewport.translateX;
    translateY.value = nextViewport.translateY;
    scale.value = nextViewport.scale;
    updateVisibleLabelCities(nextViewport, workspaceSize);
  }, [adapter, focus, initialCity, scale, translateX, translateY, updateVisibleLabelCities, variant, workspaceSize]);

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
      runOnJS(updateVisibleLabelCities)(next, { height: mapHeight.value, width: mapWidth.value });
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
      runOnJS(updateVisibleLabelCities)(next, { height: mapHeight.value, width: mapWidth.value });
    });
  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));
  const animatedCanvasStyle = useAnimatedStyle(() => ({
    transform: getCityMapTransform({ scale: scale.value, translateX: translateX.value, translateY: translateY.value }),
  }));

  const map = (
    <View accessibilityLabel={variant === "overview" ? "离线中国城市旅行地图概览" : "离线中国城市旅行地图工作区"} onLayout={variant === "workspace" ? onWorkspaceLayout : undefined} style={variant === "workspace" ? { backgroundColor: "#EEF2EE", borderRadius: 16, flex: 1, overflow: "hidden", width: "100%" } : { aspectRatio: 300 / 210, backgroundColor: "#EEF2EE", borderRadius: 20, overflow: "hidden" }} testID={variant === "workspace" ? "city-map-workspace" : undefined}>
      <Animated.View testID={variant === "workspace" ? "city-map-workspace-canvas" : undefined} style={[{ flex: 1 }, animatedCanvasStyle]}>
        <Svg height="100%" preserveAspectRatio="xMidYMid meet" testID="city-map-content" width="100%" viewBox={chinaMapViewBox}>
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
          <Path d={taiwanInsetPath} fill="#DDEBDD" stroke={colors.accent} strokeWidth={0.8} testID="china-province-taiwan-inset" />
          {adapter.markers.map((marker) => {
          const { city } = marker;
          const stat = statsByCity.get(city) ?? { city, visitCount: 0, unlocked: false, isVisited: false, intensity: "none" as const };
          return (
            <CityMapMarkerView city={city} interactive={interactive} key={city} marker={marker} onCityPress={onCityPress} stat={stat} visibleLabelCities={visibleLabelCities} />
          );
          })}
        </Svg>
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
  return <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>{map}</GestureDetector>;
}

export function CityMap(props: CityMapProps) {
  return props.variant === "overview" ? <OverviewCityMap {...props} /> : <WorkspaceCityMap {...props} />;
}

export type { CityMapProps, CityMapVariant };
