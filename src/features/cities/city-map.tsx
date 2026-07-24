import * as React from "react";
import { Image, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import chinaMap from "@svg-maps/china";

import { bodyFont, colors, serifFont } from "../../components/ui";
import type { City } from "../../types/memory";
import { cityCheckinGuides, type CityCheckinIcon } from "./city-checkin-guide";
import { cityContent } from "./city-content";
import { OfflineChinaMapAdapter, type CityMapFocus, type CityMapMarker } from "./city-map-adapter";
import { getMapCheckinAsset } from "./map-checkin-assets";
import type { CityStats, CityVisitIntensity } from "./city-stats";
import { clampWorkspaceViewport, resolveCityFocus, type WorkspaceSize, type WorkspaceViewport } from "./city-workspace";

type CityMapVariant = "overview" | "workspace";
type CityMapProps = {
  stats: readonly CityStats[];
  variant: CityMapVariant;
  initialCity?: City;
  focus?: CityMapFocus;
  interactive?: boolean;
  showCityCheckinPopup?: boolean;
  onCityPress?: (city: City) => void;
  onMapPress?: () => void;
};

const markerTokens: Record<CityVisitIntensity, { fill: string; border: string }> = {
  none: { fill: colors.surface, border: colors.paperEdge },
  light: { fill: colors.accentSoft, border: colors.accent },
  medium: { fill: colors.paperEdge, border: colors.warmAccent },
  strong: { fill: colors.warmAccent, border: colors.ink },
};
const mapPalette = Object.freeze({
  attribution: colors.muted,
  background: colors.surface,
  border: colors.paperEdge,
  land: colors.paper,
  province: colors.muted,
  route: colors.accent,
});
const overviewMapDimensions = Object.freeze({ height: 210, width: 300 });
const markerTargetSize = 44;
const markerVisualSize = 6;
const markerLabelFontSize = 12;
const markerLabelWidth = 88;
const markerLabelHeight = 20;
export const workspaceLabelZoomThreshold = 1.8;
const chinaMapViewBox = chinaMap.viewBox;
type ChinaProvince = { readonly id: string; readonly path: string };
const chinaProvinces = chinaMap.locations as readonly ChinaProvince[];
const taiwanInsetPath = "M 622 454 C 628 449 635 453 637 462 C 640 471 637 482 632 491 C 627 499 621 496 618 487 C 616 477 618 464 622 454 Z";
const [minX, minY, width, height] = chinaMapViewBox.split(/\s+/).map(Number);
export const chinaMapCoordinateSpace = Object.freeze({ height, minX, minY, width });
const markerSvgScale = chinaMapCoordinateSpace.height / overviewMapDimensions.height;
const markerSvgRadius = markerVisualSize * markerSvgScale / 2;
const markerTargetSvgSize = markerTargetSize * markerSvgScale;
const markerLabelCollisionPadding = 8;
const journeyRouteCities: readonly City[] = ["beijing", "xian", "chengdu", "wuhan", "changsha", "shanghai", "hangzhou", "suzhou", "shenzhen", "guangzhou"];
const popupSpotPositions = Object.freeze([
  { left: "21%", top: "36%" },
  { left: "51%", top: "20%" },
  { left: "74%", top: "62%" },
] as const);

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
  const dotSize = markerVisualSize;
  const pressSize = markerTargetSize;
  const fontSize = markerLabelFontSize;
  const coordinate = resolveChinaMapCoordinate(marker);
  const contentX = contentFrame.x + (coordinate.x - chinaMapCoordinateSpace.minX) * contentFrame.scale;
  const contentY = contentFrame.y + (coordinate.y - chinaMapCoordinateSpace.minY) * contentFrame.scale;
  const anchorX = (contentX - size.width / 2) * viewport.scale + size.width / 2 + viewport.translateX;
  const anchorY = (contentY - size.height / 2) * viewport.scale + size.height / 2 + viewport.translateY;
  const onScreen = anchorX + dotSize / 2 >= 0 && anchorX - dotSize / 2 <= size.width && anchorY + dotSize / 2 >= 0 && anchorY - dotSize / 2 <= size.height;
  const labelFrame = {
    height: fontSize * 1.25,
    width: markerLabelWidth,
    x: anchorX - markerLabelWidth / 2,
    y: anchorY - 24 - fontSize,
  };
  const labelOnScreen = labelFrame.x + labelFrame.width >= 0 && labelFrame.x <= size.width && labelFrame.y + labelFrame.height >= 0 && labelFrame.y <= size.height;
  const showLabel = viewport.scale >= workspaceLabelZoomThreshold && onScreen && labelOnScreen;
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

function defaultCityStat(city: City): CityStats {
  return { city, visitCount: 0, unlocked: false, isVisited: false, intensity: "none" };
}

function resolveJourneyRoutePath(markers: readonly CityMapMarker[]) {
  const markersByCity = new Map(markers.map((marker) => [marker.city, marker]));
  const points = journeyRouteCities.flatMap((city) => {
    const marker = markersByCity.get(city);
    return marker ? [resolveChinaMapCoordinate(marker)] : [];
  });
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  return rest.reduce((path, point, index) => {
    const previous = points[index];
    const controlOffset = index % 2 === 0 ? -38 * markerSvgScale : 34 * markerSvgScale;
    const controlX = (previous.x + point.x) / 2;
    return `${path} Q ${controlX.toFixed(1)} ${(previous.y + controlOffset).toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`);
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

function CheckinIcon({ name }: { readonly name: CityCheckinIcon }) {
  const stroke = colors.ink;
  const accent = colors.accent;
  const muted = colors.muted;
  const common = { fill: "none", stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };

  if (name === "bridge") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M3 16 C7 9 17 9 21 16" />
        <Path {...common} d="M5 16 H19" />
        <Path {...common} d="M8 16 V20" />
        <Path {...common} d="M16 16 V20" />
      </Svg>
    );
  }
  if (name === "city") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Rect fill="none" height={13} stroke={stroke} strokeWidth={2} width={5} x={4} y={7} />
        <Rect fill="none" height={17} stroke={stroke} strokeWidth={2} width={6} x={13} y={3} />
        <Path {...common} d="M6 11 H7 M6 15 H7 M15 8 H17 M15 12 H17 M15 16 H17" />
      </Svg>
    );
  }
  if (name === "flower") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Circle cx={12} cy={12} fill={accent} r={2} />
        <Path {...common} d="M12 4 C15 7 15 9 12 11 C9 9 9 7 12 4 Z" />
        <Path {...common} d="M20 12 C17 15 15 15 13 12 C15 9 17 9 20 12 Z" />
        <Path {...common} d="M12 20 C9 17 9 15 12 13 C15 15 15 17 12 20 Z" />
        <Path {...common} d="M4 12 C7 9 9 9 11 12 C9 15 7 15 4 12 Z" />
      </Svg>
    );
  }
  if (name === "food") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M6 4 V20 M4 4 V9 C4 11 8 11 8 9 V4" />
        <Path {...common} d="M15 4 C19 8 18 13 15 14 V20" />
        <Path {...common} d="M12 14 H18" />
      </Svg>
    );
  }
  if (name === "garden") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M4 18 C8 12 16 12 20 18" />
        <Path {...common} d="M6 18 H18" />
        <Path {...common} d="M12 6 C15 8 16 11 12 14 C8 11 9 8 12 6 Z" />
        <Path {...common} d="M12 14 V19" />
      </Svg>
    );
  }
  if (name === "gate") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M4 10 H20 L18 6 H6 Z" />
        <Path {...common} d="M6 10 V20 M18 10 V20 M9 20 V14 H15 V20" />
        <Path {...common} d="M3 20 H21" />
      </Svg>
    );
  }
  if (name === "market") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M5 10 H19 L17 5 H7 Z" />
        <Path {...common} d="M6 10 V20 H18 V10" />
        <Path {...common} d="M9 20 V15 H15 V20" />
      </Svg>
    );
  }
  if (name === "mountain") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M3 19 L9 8 L13 14 L16 10 L21 19 Z" />
        <Path fill="none" stroke={muted} strokeLinecap="round" strokeWidth={2} d="M9 8 L11 11" />
      </Svg>
    );
  }
  if (name === "museum") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M4 9 L12 4 L20 9 Z" />
        <Path {...common} d="M6 9 V18 M10 9 V18 M14 9 V18 M18 9 V18 M4 20 H20" />
      </Svg>
    );
  }
  if (name === "temple") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M5 9 L12 4 L19 9 Z" />
        <Path {...common} d="M7 9 H17 L16 13 H8 Z" />
        <Path {...common} d="M9 13 V20 M15 13 V20 M6 20 H18" />
      </Svg>
    );
  }
  if (name === "tower") {
    return (
      <Svg height={24} viewBox="0 0 24 24" width={24}>
        <Path {...common} d="M12 3 V20" />
        <Path {...common} d="M8 9 H16 M7 14 H17 M10 20 H14" />
        <Circle cx={12} cy={9} fill={colors.paper} r={3} stroke={stroke} strokeWidth={2} />
        <Circle cx={12} cy={14} fill={accent} r={2} />
      </Svg>
    );
  }
  return (
    <Svg height={24} viewBox="0 0 24 24" width={24}>
      <Path {...common} d="M4 14 C6 12 8 12 10 14 C12 16 14 16 16 14 C18 12 20 12 22 14" />
      <Path {...common} d="M4 18 C6 16 8 16 10 18 C12 20 14 20 16 18 C18 16 20 16 22 18" />
      <Path {...common} d="M12 4 C9 8 9 12 12 15 C15 12 15 8 12 4 Z" />
    </Svg>
  );
}

function CityCheckinPopup({
  city,
  onClose,
  onOpenCity,
  stat,
  variant,
}: {
  readonly city: City;
  readonly onClose: () => void;
  readonly onOpenCity?: (city: City) => void;
  readonly stat: CityStats;
  readonly variant: CityMapVariant;
}) {
  const content = cityContent[city];
  const guide = cityCheckinGuides[city];
  const checkinAsset = getMapCheckinAsset(city);
  const [activeSpotIndex, setActiveSpotIndex] = React.useState(0);
  const activeSpot = guide.spots[activeSpotIndex] ?? guide.spots[0];
  const cardStyle = variant === "workspace" ? styles.popupCardWorkspace : styles.popupCardOverview;
  const mapFrameStyle = variant === "workspace" ? styles.checkinMapFrameWorkspace : styles.checkinMapFrameOverview;

  return (
    <View pointerEvents="box-none" style={styles.popupLayer} testID={`city-checkin-popup-${city}`}>
      <View style={[styles.popupCard, cardStyle]}>
        <View style={styles.popupHeader}>
          <View style={styles.popupTitleBlock}>
            <Text selectable style={styles.popupCityName}>{content.name}</Text>
            <Text selectable style={styles.popupCaption}>JOURNEY MAP</Text>
          </View>
          <View style={styles.popupHeaderActions}>
            {onOpenCity ? (
              <Pressable accessibilityRole="button" onPress={() => onOpenCity(city)} style={({ pressed }) => [styles.openCityButton, pressed && styles.pressed]}>
                <Text selectable style={styles.openCityText}>进入档案</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityLabel="关闭城市打卡地图弹窗" accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.popupCloseButton, pressed && styles.pressed]}>
              <Text selectable style={styles.popupCloseText}>×</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.popupRouteHeader}>
          <View style={styles.popupStampDot} />
          <View style={styles.popupRouteCopy}>
            <Text selectable style={styles.popupRouteName}>{guide.routeName}</Text>
            <Text selectable numberOfLines={1} style={styles.popupRouteHint}>{guide.routeHint}</Text>
          </View>
          <Text selectable style={styles.popupMemoryCount}>{stat.visitCount} 册</Text>
        </View>

        <View style={[styles.checkinMapFrame, mapFrameStyle]} testID={`city-checkin-asset-${city}`}>
          {checkinAsset ? (
            <Image accessibilityIgnoresInvertColors resizeMode="cover" source={checkinAsset.source} style={styles.checkinMapImage} />
          ) : (
            <View style={styles.checkinMapFallback}>
              <Text selectable style={styles.checkinMapFallbackText}>足迹地图准备中</Text>
            </View>
          )}
          <View pointerEvents="box-none" style={styles.checkinMapOverlay}>
            {guide.spots.map((spot, index) => {
              const position = popupSpotPositions[index] ?? popupSpotPositions[0];
              const isActive = index === activeSpotIndex;
              return (
                <Pressable
                  accessibilityLabel={`${spot.name}打卡点`}
                  accessibilityRole="button"
                  key={spot.name}
                  onPress={() => setActiveSpotIndex(index)}
                  style={({ pressed }) => [styles.checkinLightTarget, position, isActive && styles.checkinLightTargetActive, pressed && styles.pressed]}
                  testID={`city-checkin-spot-light-${city}-${index}`}
                >
                  <View style={[styles.checkinLightGlow, isActive && styles.checkinLightGlowActive]} />
                  <View style={[styles.checkinLightCore, isActive && styles.checkinLightCoreActive]}>
                    <Text selectable={false} style={styles.checkinLightNumber}>{index + 1}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.activeSpotCard} testID={`city-checkin-active-spot-${city}`}>
          <View style={styles.spotIconBadge}>
            <CheckinIcon name={activeSpot.icon} />
          </View>
          <View style={styles.spotCopy}>
            <Text selectable numberOfLines={1} style={styles.spotName}>{activeSpot.name}</Text>
            <Text selectable numberOfLines={1} style={styles.spotNote}>{activeSpot.note}</Text>
          </View>
        </View>

        <View style={styles.spotTabs}>
          {guide.spots.map((spot, index) => (
            <Pressable
              accessibilityRole="button"
              key={spot.name}
              onPress={() => setActiveSpotIndex(index)}
              style={({ pressed }) => [styles.spotTab, index === activeSpotIndex && styles.spotTabActive, pressed && styles.pressed]}
            >
              <Text selectable={false} numberOfLines={1} style={[styles.spotTabText, index === activeSpotIndex && styles.spotTabTextActive]}>
                {spot.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
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

function WorkspaceCityMarkerOverlay({
  city,
  interactive,
  marker,
  onCityPress,
  scale,
  stat,
  translateX,
  translateY,
  visibleLabelCities,
  workspaceSize,
}: {
  readonly city: City;
  readonly interactive: boolean;
  readonly marker: CityMapMarker;
  readonly onCityPress?: (city: City) => void;
  readonly scale: SharedValue<number>;
  readonly stat: CityStats;
  readonly translateX: SharedValue<number>;
  readonly translateY: SharedValue<number>;
  readonly visibleLabelCities: readonly City[];
  readonly workspaceSize: WorkspaceSize;
}) {
  const token = markerTokens[stat.intensity];
  const coordinate = resolveChinaMapCoordinate(marker);
  const showLabel = visibleLabelCities.includes(city);
  const markerStyle = useAnimatedStyle(() => {
    const contentFrame = resolveChinaMapContentFrame(workspaceSize);
    const contentX = contentFrame.x + (coordinate.x - chinaMapCoordinateSpace.minX) * contentFrame.scale;
    const contentY = contentFrame.y + (coordinate.y - chinaMapCoordinateSpace.minY) * contentFrame.scale;
    const anchorX = (contentX - workspaceSize.width / 2) * scale.value + workspaceSize.width / 2 + translateX.value;
    const anchorY = (contentY - workspaceSize.height / 2) * scale.value + workspaceSize.height / 2 + translateY.value;
    return {
      left: anchorX - markerTargetSize / 2,
      top: anchorY - markerTargetSize / 2,
    };
  });

  return (
    <Animated.View pointerEvents="box-none" style={[styles.workspaceMarker, markerStyle]}>
      {showLabel ? (
        <Text selectable={false} style={styles.workspaceMarkerLabel} testID={`city-map-label-${city}`}>
          {cityContent[city].name}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel={savedMemoryLabel(city, stat.visitCount)}
        accessibilityRole="button"
        disabled={!interactive}
        onPress={() => onCityPress?.(city)}
        style={styles.workspaceMarkerTarget}
        testID={`city-map-marker-${city}-${stat.intensity}`}
      >
        <View
          style={[styles.workspaceMarkerDot, { backgroundColor: token.fill, borderColor: token.border }]}
          testID={`city-map-marker-dot-${city}-${stat.intensity}`}
        />
      </Pressable>
    </Animated.View>
  );
}

function OverviewCityMap({ stats, interactive = false, showCityCheckinPopup = false, onCityPress, onMapPress }: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const journeyRoutePath = React.useMemo(() => resolveJourneyRoutePath(adapter.markers), [adapter]);
  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));
  const [selectedCity, setSelectedCity] = React.useState<City | null>(null);
  const handleCityPress = React.useCallback((city: City) => {
    if (showCityCheckinPopup) {
      setSelectedCity(city);
      return;
    }
    onCityPress?.(city);
  }, [onCityPress, showCityCheckinPopup]);
  const selectedStat = selectedCity ? (statsByCity.get(selectedCity) ?? defaultCityStat(selectedCity)) : null;

  return (
    <View accessibilityLabel="离线中国城市旅行地图概览" style={styles.overviewMapFrame}>
      <Svg height="100%" preserveAspectRatio="xMidYMid meet" testID="city-map-content" width="100%" viewBox={chinaMapViewBox}>
        {chinaProvinces.map((province) => (
          <Path
            key={province.id}
            d={province.path}
            fill={mapPalette.land}
            onPress={onMapPress}
            stroke={mapPalette.province}
            strokeWidth={0.8}
            testID={`china-province-${province.id}`}
          />
        ))}
        <Path d={taiwanInsetPath} fill={mapPalette.land} stroke={mapPalette.province} strokeWidth={0.8} testID="china-province-taiwan-inset" />
        {journeyRoutePath ? (
          <Path d={journeyRoutePath} fill="none" stroke={mapPalette.route} strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4 * markerSvgScale} testID="city-map-journey-route" />
        ) : null}
        {journeyRouteCities.map((city) => {
          const marker = adapter.markers.find((candidate) => candidate.city === city);
          if (!marker) return null;
          const coordinate = resolveChinaMapCoordinate(marker);
          return <Circle cx={coordinate.x} cy={coordinate.y} fill={colors.accent} key={`route-dot-${city}`} r={markerSvgRadius * 1.5} stroke={colors.paper} strokeWidth={2 * markerSvgScale} testID={`city-map-journey-dot-${city}`} />;
        })}
        {adapter.markers.map((marker) => {
          const { city } = marker;
          const stat = statsByCity.get(city) ?? defaultCityStat(city);
          return <StaticCityMapMarkerView city={city} interactive={interactive} key={city} marker={marker} onCityPress={handleCityPress} stat={stat} />;
        })}
      </Svg>
      {onMapPress ? (
        <Pressable
          accessibilityLabel="全屏查看中国地图"
          accessibilityRole="button"
          onPress={onMapPress}
          style={({ pressed }) => [styles.fullscreenButton, pressed && styles.pressed]}
        >
          <Text selectable style={styles.fullscreenButtonText}>全屏查看</Text>
        </Pressable>
      ) : null}
      {selectedCity && selectedStat ? (
        <CityCheckinPopup city={selectedCity} onClose={() => setSelectedCity(null)} onOpenCity={onCityPress} stat={selectedStat} variant="overview" />
      ) : null}
      <Text selectable style={styles.mapAttribution}>China provincial map · CC BY 4.0</Text>
    </View>
  );
}

function WorkspaceCityMap({ stats, variant, initialCity, focus, interactive = false, showCityCheckinPopup = false, onCityPress, onMapPress }: CityMapProps) {
  const adapter = React.useMemo(() => new OfflineChinaMapAdapter(), []);
  const journeyRoutePath = React.useMemo(() => resolveJourneyRoutePath(adapter.markers), [adapter]);
  const [workspaceSize, setWorkspaceSize] = React.useState<WorkspaceSize>(overviewMapDimensions);
  const [selectedCity, setSelectedCity] = React.useState<City | null>(null);
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

  const updateVisibleLabelCities = React.useCallback((next: WorkspaceViewport, size: WorkspaceSize) => {
    setVisibleLabelCities(resolveVisibleWorkspaceLabelCities(adapter.markers, next, size));
  }, [adapter]);
  const handleCityPress = React.useCallback((city: City) => {
    if (showCityCheckinPopup) {
      setSelectedCity(city);
      return;
    }
    onCityPress?.(city);
  }, [onCityPress, showCityCheckinPopup]);

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
  const selectedStat = selectedCity ? (statsByCity.get(selectedCity) ?? defaultCityStat(selectedCity)) : null;
  const animatedCanvasStyle = useAnimatedStyle(() => ({
    transform: getCityMapTransform({ scale: scale.value, translateX: translateX.value, translateY: translateY.value }),
  }));

  const map = (
    <View accessibilityLabel={variant === "overview" ? "离线中国城市旅行地图概览" : "离线中国城市旅行地图工作区"} onLayout={variant === "workspace" ? onWorkspaceLayout : undefined} style={variant === "workspace" ? styles.workspaceMapFrame : styles.overviewMapFrame} testID={variant === "workspace" ? "city-map-workspace" : undefined}>
      <Animated.View testID={variant === "workspace" ? "city-map-workspace-canvas" : undefined} style={[{ flex: 1 }, animatedCanvasStyle]}>
        <Svg height="100%" preserveAspectRatio="xMidYMid meet" testID="city-map-content" width="100%" viewBox={chinaMapViewBox}>
          {chinaProvinces.map((province) => (
            <Path
              key={province.id}
              d={province.path}
              fill={mapPalette.land}
              onPress={variant === "overview" ? onMapPress : undefined}
              stroke={mapPalette.province}
              strokeWidth={0.8}
              testID={`china-province-${province.id}`}
            />
          ))}
          <Path d={taiwanInsetPath} fill={mapPalette.land} stroke={mapPalette.province} strokeWidth={0.8} testID="china-province-taiwan-inset" />
          {journeyRoutePath ? (
            <Path d={journeyRoutePath} fill="none" stroke={mapPalette.route} strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4 * markerSvgScale} testID="city-map-journey-route" />
          ) : null}
        </Svg>
      </Animated.View>
      <View pointerEvents="box-none" style={styles.workspaceMarkerLayer}>
        {adapter.markers.map((marker) => {
          const { city } = marker;
          const stat = statsByCity.get(city) ?? defaultCityStat(city);
          return (
            <WorkspaceCityMarkerOverlay
              city={city}
              interactive={interactive}
              key={city}
              marker={marker}
              onCityPress={handleCityPress}
              scale={scale}
              stat={stat}
              translateX={translateX}
              translateY={translateY}
              visibleLabelCities={visibleLabelCities}
              workspaceSize={workspaceSize}
            />
          );
        })}
      </View>
      {variant === "overview" && onMapPress ? (
        <Pressable
          accessibilityLabel="全屏查看中国地图"
          accessibilityRole="button"
          onPress={onMapPress}
          style={({ pressed }) => [styles.fullscreenButton, pressed && styles.pressed]}
        >
          <Text selectable style={styles.fullscreenButtonText}>全屏查看</Text>
        </Pressable>
      ) : null}
      {selectedCity && selectedStat ? (
        <CityCheckinPopup city={selectedCity} onClose={() => setSelectedCity(null)} onOpenCity={onCityPress} stat={selectedStat} variant={variant} />
      ) : null}
      <Text selectable style={styles.mapAttribution}>China provincial map · CC BY 4.0</Text>
    </View>
  );
  return <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>{map}</GestureDetector>;
}

export function CityMap(props: CityMapProps) {
  return props.variant === "overview" ? <OverviewCityMap {...props} /> : <WorkspaceCityMap {...props} />;
}

const styles = StyleSheet.create({
  activeSpotCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.paperEdge,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    padding: 6,
  },
  checkinLightCore: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderColor: colors.background,
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  checkinLightCoreActive: { backgroundColor: colors.muted },
  checkinLightGlow: {
    backgroundColor: "rgba(181, 107, 82, 0.24)",
    borderRadius: 19,
    height: 38,
    position: "absolute",
    width: 38,
  },
  checkinLightGlowActive: { backgroundColor: "rgba(86, 112, 138, 0.28)" },
  checkinLightNumber: { color: colors.background, fontFamily: bodyFont, fontSize: 11 },
  checkinLightTarget: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: -22,
    marginTop: -22,
    position: "absolute",
    width: 44,
  },
  checkinLightTargetActive: { transform: [{ scale: 1.08 }] },
  checkinMapFallback: {
    alignItems: "center",
    backgroundColor: colors.paper,
    flex: 1,
    justifyContent: "center",
  },
  checkinMapFallbackText: { color: colors.muted, fontFamily: bodyFont, fontSize: 12 },
  checkinMapFrame: {
    backgroundColor: colors.paper,
    borderColor: colors.paperEdge,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  checkinMapFrameOverview: { height: 78 },
  checkinMapFrameWorkspace: { aspectRatio: 0.64, maxHeight: 520, minHeight: 260 },
  checkinMapImage: { height: "100%", width: "100%" },
  checkinMapOverlay: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  fullscreenButton: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: 16,
    borderWidth: 1,
    bottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "absolute",
    right: 12,
  },
  fullscreenButtonText: { color: colors.accent, fontFamily: bodyFont, fontSize: 13 },
  mapAttribution: {
    bottom: 10,
    color: mapPalette.attribution,
    fontFamily: bodyFont,
    fontSize: 10,
    left: 12,
    position: "absolute",
  },
  openCityButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  openCityText: { color: colors.background, fontFamily: bodyFont, fontSize: 12 },
  overviewMapFrame: {
    aspectRatio: 300 / 210,
    backgroundColor: mapPalette.background,
    borderColor: mapPalette.border,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  popupCaption: { color: colors.accent, fontFamily: bodyFont, fontSize: 10 },
  popupCard: {
    backgroundColor: colors.paper,
    borderColor: colors.ink,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    shadowColor: colors.ink,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  popupCardOverview: {
    left: 6,
    padding: 6,
    position: "absolute",
    right: 6,
    top: 6,
  },
  popupCardWorkspace: {
    bottom: 14,
    left: 14,
    padding: 12,
    position: "absolute",
    right: 14,
  },
  popupCityName: { color: colors.ink, fontFamily: serifFont, fontSize: 20 },
  popupCloseButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.paperEdge,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  popupCloseText: { color: colors.ink, fontFamily: bodyFont, fontSize: 18, lineHeight: 20 },
  popupHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  popupHeaderActions: { alignItems: "center", flexDirection: "row", gap: 6 },
  popupLayer: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  popupMemoryCount: { color: colors.muted, fontFamily: bodyFont, fontSize: 12 },
  popupRouteCopy: { flex: 1 },
  popupRouteHeader: { alignItems: "center", flexDirection: "row", gap: 8 },
  popupRouteHint: { color: colors.muted, fontFamily: bodyFont, fontSize: 11 },
  popupRouteName: { color: colors.ink, fontFamily: serifFont, fontSize: 15 },
  popupStampDot: {
    backgroundColor: colors.accent,
    borderColor: colors.background,
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  popupTitleBlock: { gap: 1 },
  pressed: { opacity: 0.82 },
  spotCopy: { flex: 1 },
  spotIconBadge: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.paperEdge,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  spotList: { flexDirection: "row", gap: 6 },
  spotName: { color: colors.ink, fontFamily: bodyFont, fontSize: 11 },
  spotNote: { color: colors.muted, fontFamily: bodyFont, fontSize: 10, marginTop: 1 },
  spotRow: {
    backgroundColor: colors.surface,
    borderColor: colors.paperEdge,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minWidth: 0,
    padding: 6,
  },
  spotTab: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.paperEdge,
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 26,
    minWidth: 0,
    paddingHorizontal: 6,
  },
  spotTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  spotTabText: { color: colors.muted, fontFamily: bodyFont, fontSize: 11 },
  spotTabTextActive: { color: colors.background },
  spotTabs: { flexDirection: "row", gap: 6 },
  workspaceMarker: {
    alignItems: "center",
    height: markerTargetSize,
    justifyContent: "center",
    position: "absolute",
    width: markerTargetSize,
  },
  workspaceMarkerDot: {
    borderRadius: markerVisualSize / 2,
    borderWidth: 1,
    height: markerVisualSize,
    width: markerVisualSize,
  },
  workspaceMarkerLabel: {
    backgroundColor: colors.surface,
    borderColor: colors.paperEdge,
    borderRadius: 9,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: markerLabelFontSize,
    left: (markerTargetSize - markerLabelWidth) / 2,
    lineHeight: markerLabelHeight,
    overflow: "hidden",
    paddingHorizontal: 6,
    position: "absolute",
    textAlign: "center",
    top: -markerLabelHeight + 2,
    width: markerLabelWidth,
  },
  workspaceMarkerLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  workspaceMarkerTarget: {
    alignItems: "center",
    height: markerTargetSize,
    justifyContent: "center",
    width: markerTargetSize,
  },
  workspaceMapFrame: {
    backgroundColor: mapPalette.background,
    borderColor: mapPalette.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
    width: "100%",
  },
});

export type { CityMapProps, CityMapVariant };
