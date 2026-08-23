import * as React from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { colors } from "../../components/ui";
import type { City } from "../../types/memory";
import { headingFontFamily } from "../typography/fonts";
import {
  resolveCityLabelEdgeOpacity,
  resolveCityMapContentFrame,
  resolveLabelZoomTier,
  resolveNormalizedMapScreenPoint,
  resolveVisibleCityLabels,
} from "./city-label-layout";
import { OfflineChinaMapAdapter, type CityMapFocus, type CityMapMarker } from "./city-map-adapter";
import {
  chinaMapAttribution,
  chinaMapViewBox,
  chinaPrefectureLabels,
  chinaProvinces,
  chinaSouthSeaInset,
  type ChinaPrefectureLabel,
} from "./china-map-data";
import { cityContent } from "./city-content";
import type { CityStats, CityVisitIntensity } from "./city-stats";
import {
  clampWorkspaceViewport,
  getWorkspaceTranslationLimits,
  resolveCityFocus,
  workspaceMaxScale,
  workspaceMinScale,
  type WorkspaceSize,
  type WorkspaceViewport,
} from "./city-workspace";

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

export type { CityMapProps, CityMapVariant };

const markerTokens: Record<CityVisitIntensity, { fill: string; border: string }> = {
  none: { fill: colors.surface, border: colors.line },
  light: { fill: colors.accentSoft, border: colors.accent },
  medium: { fill: colors.accentSoft, border: colors.warmAccent },
  strong: { fill: colors.warmAccent, border: colors.ink },
};

const [minX, minY, width, height] = chinaMapViewBox.split(/\s+/).map(Number);
export const chinaMapCoordinateSpace = Object.freeze({ height, minX, minY, width });
const overviewMapDimensions = Object.freeze({
  height: 300 * chinaMapCoordinateSpace.height / chinaMapCoordinateSpace.width,
  width: 300,
});
const markerTargetSize = 44;
const markerVisualSize = 8;
const workspaceMarkerHitRadius = markerTargetSize / 2;
const workspaceTapMaxDistance = 10;
const markerLabelWidth = 88;
const markerLabelHeight = 20;
const markerSvgScale = chinaMapCoordinateSpace.width / overviewMapDimensions.width;
const markerSvgRadius = markerVisualSize * markerSvgScale / 2;
const chinaProvincesData = chinaProvinces as readonly { readonly id: string; readonly name: string; readonly path: string }[];
const prefectureLabels = chinaPrefectureLabels;
export const workspaceLabelZoomThreshold = 1.6;

type MarkerFrame = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type CityMarkerLayout = {
  readonly anchor: { readonly x: number; readonly y: number };
  readonly pressFrame: MarkerFrame;
  readonly labelFrame: MarkerFrame;
  readonly markerFrame: MarkerFrame;
};

/** Resolve overview hit targets from the measured card instead of a design-time width. */
export function resolveCityMarkerLayout(marker: CityMapMarker, size: WorkspaceSize = overviewMapDimensions): CityMarkerLayout {
  const anchor = { x: marker.coordinate.x * size.width, y: marker.coordinate.y * size.height };
  const pressFrame = {
    height: markerTargetSize,
    width: markerTargetSize,
    x: anchor.x - markerTargetSize / 2,
    y: anchor.y - markerTargetSize / 2,
  };
  return {
    anchor,
    labelFrame: {
      height: markerLabelHeight,
      width: markerLabelWidth,
      x: Math.min(Math.max(0, anchor.x - markerLabelWidth / 2), Math.max(0, size.width - markerLabelWidth)),
      y: Math.max(0, anchor.y - 30),
    },
    markerFrame: {
      height: markerVisualSize,
      width: markerVisualSize,
      x: anchor.x - markerVisualSize / 2,
      y: anchor.y - markerVisualSize / 2,
    },
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
  return resolveCityMapContentFrame(size);
}

function savedMemoryLabel(city: City, visitCount: number) {
  return `${cityContent[city].name}，已保存 ${visitCount} 册旅行记忆`;
}

function focusViewport(focus: CityMapFocus, size: WorkspaceSize): WorkspaceViewport {
  if (focus.zoom <= workspaceMinScale) {
    return { scale: workspaceMinScale, translateX: 0, translateY: 0 };
  }
  const contentFrame = resolveChinaMapContentFrame(size);
  const centerX = contentFrame.x + focus.center.x * contentFrame.width;
  const centerY = contentFrame.y + focus.center.y * contentFrame.height;
  return clampWorkspaceViewport({
    scale: focus.zoom,
    translateX: (0.5 - centerX / size.width) * size.width * focus.zoom,
    translateY: (0.5 - centerY / size.height) * size.height * focus.zoom,
  }, size);
}

function getWorkspaceFocus(
  adapter: OfflineChinaMapAdapter,
  initialCity: City | undefined,
  focus: CityMapFocus | undefined,
) {
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

function computeMarkerScreenPosition(
  marker: CityMapMarker,
  viewport: WorkspaceViewport,
  size: WorkspaceSize,
) {
  "worklet";
  if (size.width <= 0 || size.height <= 0) return { x: 0, y: 0 };
  const contentFrame = resolveChinaMapContentFrame(size);
  const coordinate = resolveChinaMapCoordinate(marker);
  const baseX = contentFrame.x + (coordinate.x - chinaMapCoordinateSpace.minX) * contentFrame.scale;
  const baseY = contentFrame.y + (coordinate.y - chinaMapCoordinateSpace.minY) * contentFrame.scale;
  return {
    x: (baseX - size.width / 2) * viewport.scale + size.width / 2 + viewport.translateX,
    y: (baseY - size.height / 2) * viewport.scale + size.height / 2 + viewport.translateY,
  };
}

export function resolveWorkspaceMarkerHit(
  point: Readonly<{ x: number; y: number }>,
  viewport: WorkspaceViewport,
  size: WorkspaceSize,
  markers: readonly CityMapMarker[],
): City | undefined {
  "worklet";
  if (size.width <= 0 || size.height <= 0) return undefined;
  const hitRadiusSquared = workspaceMarkerHitRadius * workspaceMarkerHitRadius;
  let nearestCity: City | undefined;
  let nearestDistanceSquared = hitRadiusSquared;
  for (const marker of markers) {
    const markerPoint = computeMarkerScreenPosition(marker, viewport, size);
    const deltaX = point.x - markerPoint.x;
    const deltaY = point.y - markerPoint.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared <= nearestDistanceSquared) {
      nearestCity = marker.city;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearestCity;
}

function boundedGestureVelocity(velocity: number | undefined) {
  "worklet";
  return Math.min(1600, Math.max(-1600, velocity ?? 0));
}

export function resolveWorkspaceDoubleTapScale(currentScale: number) {
  "worklet";
  if (currentScale < 2) return 2;
  if (currentScale < 4) return 4;
  if (currentScale < workspaceMaxScale) return workspaceMaxScale;
  return workspaceMinScale;
}

function ChinaMapArtwork({ onMapPress }: { readonly onMapPress?: () => void }) {
  const inset = chinaSouthSeaInset.frame;
  return (
    <>
      {chinaProvincesData.map((province) => (
        <Path
          d={province.path}
          fill={colors.paper}
          key={province.id}
          onPress={onMapPress}
          stroke={colors.accent}
          strokeWidth={0.8}
          testID={`china-province-${province.id}`}
        />
      ))}
      <G testID="china-south-sea-inset" transform={`translate(${inset.x} ${inset.y})`}>
        <Rect
          fill={colors.surface}
          fillOpacity={0.94}
          height={inset.height}
          onPress={onMapPress}
          rx={5}
          stroke={colors.accent}
          strokeWidth={1.2}
          width={inset.width}
        />
        <Path
          d={chinaSouthSeaInset.path}
          fill={colors.paper}
          onPress={onMapPress}
          stroke={colors.accent}
          strokeWidth={0.75}
          testID="china-south-sea-inset-path"
        />
      </G>
    </>
  );
}

// ─── Overview ────────────────────────────────────────────────────────

function OverviewCityMap({ stats, interactive = false, onCityPress, onMapPress }: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));
  const [overviewSize, setOverviewSize] = React.useState<WorkspaceSize>(overviewMapDimensions);
  const onOverviewLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { height: nextHeight, width: nextWidth } = event.nativeEvent.layout;
    if (nextHeight <= 0 || nextWidth <= 0) return;
    setOverviewSize((current) => current.height === nextHeight && current.width === nextWidth
      ? current
      : { height: nextHeight, width: nextWidth });
  }, []);

  return (
    <View
      accessibilityLabel="离线中国城市旅行地图概览"
      onLayout={onOverviewLayout}
      style={{
        aspectRatio: overviewMapDimensions.width / overviewMapDimensions.height,
        backgroundColor: colors.accentSoft,
        borderRadius: 20,
        overflow: "hidden",
      }}
      testID="city-map-overview"
    >
      <Svg height="100%" preserveAspectRatio="xMidYMid meet" testID="city-map-content" width="100%" viewBox={chinaMapViewBox}>
        <ChinaMapArtwork onMapPress={onMapPress} />
        {adapter.markers.map((marker) => {
          const stat = statsByCity.get(marker.city) ?? {
            city: marker.city,
            intensity: "none" as const,
            isVisited: false,
            unlocked: false,
            visitCount: 0,
          };
          const token = markerTokens[stat.intensity];
          const coordinate = resolveChinaMapCoordinate(marker);
          return (
            <G key={marker.city} testID={`city-map-marker-${marker.city}-${stat.intensity}`}>
              <Circle
                cx={coordinate.x}
                cy={coordinate.y}
                fill={token.fill}
                r={markerSvgRadius}
                stroke={token.border}
                strokeWidth={1.5 * markerSvgScale}
              />
            </G>
          );
        })}
      </Svg>

      {adapter.markers.map((marker) => {
        const stat = statsByCity.get(marker.city) ?? {
          city: marker.city,
          intensity: "none" as const,
          isVisited: false,
          unlocked: false,
          visitCount: 0,
        };
        const layout = resolveCityMarkerLayout(marker, overviewSize);
        return (
          <Pressable
            accessibilityLabel={savedMemoryLabel(marker.city, stat.visitCount)}
            accessibilityRole="button"
            key={`${marker.city}-target`}
            onPress={interactive ? () => onCityPress?.(marker.city) : undefined}
            style={({ pressed }) => ({
              height: layout.pressFrame.height,
              left: layout.pressFrame.x,
              opacity: pressed ? 0.82 : 1,
              position: "absolute",
              top: layout.pressFrame.y,
              width: layout.pressFrame.width,
            })}
            testID={`city-map-marker-target-${marker.city}-${stat.intensity}`}
          />
        );
      })}

      {onMapPress ? (
        <Pressable
          accessibilityLabel="全屏查看中国地图"
          accessibilityRole="button"
          onPress={onMapPress}
          style={({ pressed }) => ({
            backgroundColor: colors.surface,
            borderColor: colors.accent,
            borderRadius: 16,
            borderWidth: 1,
            bottom: 12,
            opacity: pressed ? 0.82 : 1,
            paddingHorizontal: 12,
            paddingVertical: 8,
            position: "absolute",
            right: 12,
          })}
        >
          <Text selectable style={{ color: colors.accent, fontSize: 13, fontWeight: "800" }}>全屏查看</Text>
        </Pressable>
      ) : null}
      <Text selectable style={styles.attribution}>{chinaMapAttribution}</Text>
    </View>
  );
}

// ─── Workspace overlays ─────────────────────────────────────────────

type SharedNumber = { value: number };

type AnimatedMarkerProps = {
  readonly marker: CityMapMarker;
  readonly stat: CityStats;
  readonly interactive: boolean;
  readonly onCityPress?: (city: City) => void;
  readonly translateX: SharedNumber;
  readonly translateY: SharedNumber;
  readonly scale: SharedNumber;
  readonly mapWidth: SharedNumber;
  readonly mapHeight: SharedNumber;
};

function AnimatedWorkspaceMarker({
  marker,
  stat,
  interactive,
  onCityPress,
  translateX,
  translateY,
  scale,
  mapWidth,
  mapHeight,
}: AnimatedMarkerProps) {
  const token = markerTokens[stat.intensity];
  const animatedStyle = useAnimatedStyle(() => {
    const size = { height: mapHeight.value, width: mapWidth.value };
    const viewport = { scale: scale.value, translateX: translateX.value, translateY: translateY.value };
    const position = computeMarkerScreenPosition(marker, viewport, size);
    return {
      height: markerTargetSize,
      left: position.x - markerTargetSize / 2,
      opacity: size.width > 0 && size.height > 0 ? 1 : 0,
      top: position.y - markerTargetSize / 2,
      width: markerTargetSize,
    };
  });

  return (
    <Animated.View
      accessible={false}
      style={[styles.workspaceMarkerTarget, animatedStyle]}
      testID={`city-map-marker-dot-${marker.city}-${stat.intensity}`}
    >
      <View
        accessible
        accessibilityLabel={savedMemoryLabel(marker.city, stat.visitCount)}
        accessibilityRole="button"
        onAccessibilityTap={interactive ? () => onCityPress?.(marker.city) : undefined}
        pointerEvents="none"
        style={styles.workspaceMarkerPressable}
      >
        <Animated.View
          style={[styles.workspaceMarkerDot, { backgroundColor: token.fill, borderColor: token.border }]}
          testID={`city-map-marker-visual-${marker.city}`}
        />
      </View>
    </Animated.View>
  );
}

function labelTextStyle(label: ChinaPrefectureLabel) {
  if (label.isCapital) return { fontSize: 13, fontWeight: "700" as const };
  if (label.productCity) return { fontSize: 12, fontWeight: "600" as const };
  return { fontSize: 11, fontWeight: "400" as const };
}

function AnimatedPrefectureLabel({
  label,
  mapHeight,
  mapWidth,
  scale,
  translateX,
  translateY,
}: {
  readonly label: ChinaPrefectureLabel;
  readonly mapHeight: SharedNumber;
  readonly mapWidth: SharedNumber;
  readonly scale: SharedNumber;
  readonly translateX: SharedNumber;
  readonly translateY: SharedNumber;
}) {
  const typography = labelTextStyle(label);
  const width = Math.max(28, label.displayName.length * typography.fontSize + 10);
  const height = typography.fontSize + 8;
  const animatedStyle = useAnimatedStyle(() => {
    const size = { height: mapHeight.value, width: mapWidth.value };
    if (size.width <= 0 || size.height <= 0) return { opacity: 0 };
    const point = resolveNormalizedMapScreenPoint(label.coordinate, {
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    }, size);
    return {
      opacity: resolveCityLabelEdgeOpacity(point.x, point.y, size),
      transform: [
        { translateX: point.x - width / 2 },
        { translateY: point.y - height / 2 },
      ],
    };
  });

  return (
    <Animated.View
      accessibilityElementsHidden
      accessible={false}
      entering={FadeIn.duration(140)}
      exiting={FadeOut.duration(140)}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.prefectureLabel, { height, width }]}
      testID={`city-map-prefecture-label-${label.adcode}`}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.prefectureLabelContent, animatedStyle]}>
        <Text
          accessible={false}
          numberOfLines={1}
          style={[styles.prefectureLabelText, typography]}
        >
          {label.displayName}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Workspace ──────────────────────────────────────────────────────

function WorkspaceCityMap({
  stats,
  variant,
  initialCity,
  focus,
  interactive = false,
  onCityPress,
  targetCity,
  onTargetReached,
}: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const workspaceMarkers = React.useMemo<readonly CityMapMarker[]>(() => Object.freeze(adapter.markers.map((marker) => (
    Object.freeze({
      city: marker.city,
      coordinate: Object.freeze({ x: marker.coordinate.x, y: marker.coordinate.y }),
    })
  ))), [adapter]);
  const [workspaceSize, setWorkspaceSize] = React.useState<WorkspaceSize>({ height: 0, width: 0 });
  const [visibleLabels, setVisibleLabels] = React.useState<readonly ChinaPrefectureLabel[]>([]);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const panDecayAxesRemaining = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchStartFocalX = useSharedValue(0);
  const pinchStartFocalY = useSharedValue(0);
  const mapWidth = useSharedValue(0);
  const mapHeight = useSharedValue(0);
  const labelZoomTier = useSharedValue(-1);

  const settleVisibleLabels = React.useCallback((viewport: WorkspaceViewport, size: WorkspaceSize) => {
    if (size.width <= 0 || size.height <= 0) {
      setVisibleLabels([]);
      return;
    }
    const nextTier = resolveLabelZoomTier(viewport.scale, labelZoomTier.value);
    labelZoomTier.value = nextTier;
    setVisibleLabels(resolveVisibleCityLabels(
      prefectureLabels,
      viewport,
      size,
      nextTier,
    ));
  }, [labelZoomTier]);

  React.useEffect(() => {
    if (!targetCity || workspaceSize.width <= 0 || workspaceSize.height <= 0) return;
    const cityFocus = adapter.cityFocus[targetCity];
    if (!cityFocus) return;
    const nextViewport = focusViewport(cityFocus, workspaceSize);
    translateX.value = withTiming(nextViewport.translateX, { duration: 500 });
    translateY.value = withTiming(nextViewport.translateY, { duration: 500 });
    scale.value = withTiming(nextViewport.scale, { duration: 500 }, () => {
      runOnJS(settleVisibleLabels)(nextViewport, workspaceSize);
      if (onTargetReached) runOnJS(onTargetReached)();
    });
  }, [adapter, onTargetReached, scale, settleVisibleLabels, targetCity, translateX, translateY, workspaceSize]);

  React.useEffect(() => {
    if (workspaceSize.width <= 0 || workspaceSize.height <= 0) return;
    const nextViewport = focusViewport(getWorkspaceFocus(adapter, initialCity, focus), workspaceSize);
    translateX.value = nextViewport.translateX;
    translateY.value = nextViewport.translateY;
    scale.value = nextViewport.scale;
    settleVisibleLabels(nextViewport, workspaceSize);
  }, [adapter, focus, initialCity, scale, settleVisibleLabels, translateX, translateY, workspaceSize]);

  const onWorkspaceLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { height: nextHeight, width: nextWidth } = event.nativeEvent.layout;
    if (nextHeight <= 0 || nextWidth <= 0) return;
    mapWidth.value = nextWidth;
    mapHeight.value = nextHeight;
    setWorkspaceSize((current) => current.height === nextHeight && current.width === nextWidth
      ? current
      : { height: nextHeight, width: nextWidth });
  }, [mapHeight, mapWidth]);

  const pan = Gesture.Pan()
    .enabled(variant === "workspace")
    .maxPointers(1)
    .onBegin(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      const next = clampWorkspaceViewport({
        scale: scale.value,
        translateX: panStartX.value + event.translationX,
        translateY: panStartY.value + event.translationY,
      }, { height: mapHeight.value, width: mapWidth.value });
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    })
    .onEnd((event, success) => {
      if (!success) return;
      const size = { height: mapHeight.value, width: mapWidth.value };
      const limits = getWorkspaceTranslationLimits(scale.value, size);
      panDecayAxesRemaining.value = 2;
      translateX.value = withDecay({
        clamp: [-limits.x, limits.x],
        deceleration: 0.985,
        velocity: boundedGestureVelocity(event.velocityX),
        velocityFactor: 0.35,
      }, (finished) => {
        if (!finished || panDecayAxesRemaining.value <= 0) {
          panDecayAxesRemaining.value = -1;
          return;
        }
        panDecayAxesRemaining.value -= 1;
        if (panDecayAxesRemaining.value !== 0) return;
        runOnJS(settleVisibleLabels)({
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        }, size);
      });
      translateY.value = withDecay({
        clamp: [-limits.y, limits.y],
        deceleration: 0.985,
        velocity: boundedGestureVelocity(event.velocityY),
        velocityFactor: 0.35,
      }, (finished) => {
        if (!finished || panDecayAxesRemaining.value <= 0) {
          panDecayAxesRemaining.value = -1;
          return;
        }
        panDecayAxesRemaining.value -= 1;
        if (panDecayAxesRemaining.value !== 0) return;
        runOnJS(settleVisibleLabels)({
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        }, size);
      });
    });

  const pinch = Gesture.Pinch()
    .enabled(variant === "workspace")
    .onBegin((event) => {
      pinchStartScale.value = scale.value;
      pinchStartX.value = translateX.value;
      pinchStartY.value = translateY.value;
      pinchStartFocalX.value = event.focalX;
      pinchStartFocalY.value = event.focalY;
    })
    .onUpdate((event) => {
      const size = { height: mapHeight.value, width: mapWidth.value };
      const boundedScale = clampWorkspaceViewport({
        scale: pinchStartScale.value * event.scale,
        translateX: 0,
        translateY: 0,
      }, size).scale;
      const ratio = boundedScale / pinchStartScale.value;
      const startFocusX = pinchStartFocalX.value - size.width / 2;
      const startFocusY = pinchStartFocalY.value - size.height / 2;
      const currentFocusX = event.focalX - size.width / 2;
      const currentFocusY = event.focalY - size.height / 2;
      const next = clampWorkspaceViewport({
        scale: boundedScale,
        translateX: currentFocusX - (startFocusX - pinchStartX.value) * ratio,
        translateY: currentFocusY - (startFocusY - pinchStartY.value) * ratio,
      }, size);
      scale.value = next.scale;
      translateX.value = next.translateX;
      translateY.value = next.translateY;
    })
    .onFinalize(() => {
      const next = clampWorkspaceViewport({
        scale: scale.value,
        translateX: translateX.value,
        translateY: translateY.value,
      }, { height: mapHeight.value, width: mapWidth.value });
      scale.value = next.scale;
      translateX.value = next.translateX;
      translateY.value = next.translateY;
      runOnJS(settleVisibleLabels)(next, { height: mapHeight.value, width: mapWidth.value });
    });

  const cityTap = Gesture.Tap()
    .enabled(variant === "workspace" && interactive && Boolean(onCityPress))
    .maxDistance(workspaceTapMaxDistance)
    .onEnd((event, success) => {
      if (!success || !onCityPress) return;
      const city = resolveWorkspaceMarkerHit({ x: event.x, y: event.y }, {
        scale: scale.value,
        translateX: translateX.value,
        translateY: translateY.value,
      }, { height: mapHeight.value, width: mapWidth.value }, workspaceMarkers);
      if (city) runOnJS(onCityPress)(city);
    });

  const doubleTap = Gesture.Tap()
    .enabled(variant === "workspace")
    .numberOfTaps(2)
    .maxDistance(workspaceTapMaxDistance)
    .maxDelay(280)
    .onEnd((event, success) => {
      if (!success) return;
      const size = { height: mapHeight.value, width: mapWidth.value };
      const currentScale = scale.value;
      const nextScale = resolveWorkspaceDoubleTapScale(currentScale);
      const scaleRatio = nextScale / currentScale;
      const focusX = event.x - size.width / 2;
      const focusY = event.y - size.height / 2;
      const next = clampWorkspaceViewport({
        scale: nextScale,
        translateX: focusX - (focusX - translateX.value) * scaleRatio,
        translateY: focusY - (focusY - translateY.value) * scaleRatio,
      }, size);
      translateX.value = withTiming(next.translateX, { duration: 200 });
      translateY.value = withTiming(next.translateY, { duration: 200 });
      scale.value = withTiming(next.scale, { duration: 200 }, () => {
        runOnJS(settleVisibleLabels)(next, size);
      });
    });

  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));
  const animatedCanvasStyle = useAnimatedStyle(() => ({
    transform: getCityMapTransform({
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    }),
  }));
  const sharedValues = React.useMemo(() => ({
    mapHeight,
    mapWidth,
    scale,
    translateX,
    translateY,
  }), [mapHeight, mapWidth, scale, translateX, translateY]);

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, Gesture.Exclusive(doubleTap, cityTap))}>
      <View
        accessibilityLabel="离线中国城市旅行地图工作区"
        onLayout={onWorkspaceLayout}
        style={styles.workspace}
        testID="city-map-workspace"
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, animatedCanvasStyle]}
          testID="city-map-workspace-canvas"
        >
          <Svg height="100%" preserveAspectRatio="xMidYMid meet" testID="city-map-content" width="100%" viewBox={chinaMapViewBox}>
            <ChinaMapArtwork />
          </Svg>
        </Animated.View>

        <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="city-map-label-layer">
          {visibleLabels.map((label) => (
            <AnimatedPrefectureLabel
              key={label.adcode}
              label={label}
              mapHeight={sharedValues.mapHeight}
              mapWidth={sharedValues.mapWidth}
              scale={sharedValues.scale}
              translateX={sharedValues.translateX}
              translateY={sharedValues.translateY}
            />
          ))}
        </View>

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {workspaceSize.width > 0 && workspaceSize.height > 0 ? [...workspaceMarkers]
            .sort((left, right) => left.coordinate.y - right.coordinate.y)
            .map((marker) => {
              const stat = statsByCity.get(marker.city) ?? {
                city: marker.city,
                intensity: "none" as const,
                isVisited: false,
                unlocked: false,
                visitCount: 0,
              };
              return (
                <AnimatedWorkspaceMarker
                  interactive={interactive}
                  key={marker.city}
                  mapHeight={sharedValues.mapHeight}
                  mapWidth={sharedValues.mapWidth}
                  marker={marker}
                  onCityPress={onCityPress}
                  scale={sharedValues.scale}
                  stat={stat}
                  translateX={sharedValues.translateX}
                  translateY={sharedValues.translateY}
                />
              );
            }) : null}
        </View>

        <Text selectable style={styles.attribution}>{chinaMapAttribution}</Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  attribution: {
    bottom: 8,
    color: colors.muted,
    fontSize: 9,
    left: 10,
    position: "absolute",
    zIndex: 4,
  },
  prefectureLabel: {
    position: "absolute",
  },
  prefectureLabelContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  prefectureLabelText: {
    backgroundColor: "rgba(239, 226, 207, 0.78)",
    borderRadius: 3,
    color: colors.ink,
    fontFamily: headingFontFamily,
    overflow: "hidden",
    paddingHorizontal: 3,
    textAlign: "center",
  },
  workspace: {
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    flex: 1,
    overflow: "hidden",
    width: "100%",
  },
  workspaceMarkerDot: {
    borderRadius: markerVisualSize / 2,
    borderWidth: 1.5,
    height: markerVisualSize,
    width: markerVisualSize,
  },
  workspaceMarkerPressable: {
    alignItems: "center",
    height: markerTargetSize,
    justifyContent: "center",
    width: markerTargetSize,
  },
  workspaceMarkerTarget: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
  },
});

export function CityMap(props: CityMapProps) {
  return props.variant === "overview" ? <OverviewCityMap {...props} /> : <WorkspaceCityMap {...props} />;
}
