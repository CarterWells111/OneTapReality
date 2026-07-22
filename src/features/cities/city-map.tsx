import { Pressable, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";

import { colors } from "../../components/ui";
import type { City } from "../../types/memory";
import { cityContent } from "./city-content";
import { OfflineChinaMapAdapter, type CityMapFocus, type CityMapMarker } from "./city-map-adapter";
import type { CityStats, CityVisitIntensity } from "./city-stats";

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

type MarkerFrame = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type CityMarkerLayout = {
  readonly anchor: { readonly x: number; readonly y: number };
  readonly pressFrame: MarkerFrame;
  readonly labelFrame: MarkerFrame;
  readonly markerFrame: MarkerFrame;
};

type MarkerPlacement = {
  readonly label: Omit<MarkerFrame, "x" | "y"> & { readonly offsetX: number; readonly offsetY: number };
  readonly pressOffsetX: number;
  readonly pressOffsetY: number;
};

const markerPlacements: Record<City, MarkerPlacement> = {
  // These nearby source coordinates stay fixed; only their hit target and text placement are offset.
  hangzhou: {
    label: { height: 20, offsetX: -76, offsetY: 28, width: 80 },
    pressOffsetX: -37,
    pressOffsetY: -22,
  },
  shanghai: {
    label: { height: 20, offsetX: -8, offsetY: -48, width: 72 },
    pressOffsetX: -7,
    pressOffsetY: -22,
  },
  shenzhen: {
    label: { height: 20, offsetX: -37, offsetY: 26, width: 74 },
    pressOffsetX: -22,
    pressOffsetY: -22,
  },
};

export function resolveCityMarkerLayout(marker: CityMapMarker): CityMarkerLayout {
  const anchor = {
    x: marker.coordinate.x * overviewMapDimensions.width,
    y: marker.coordinate.y * overviewMapDimensions.height,
  };
  const placement = markerPlacements[marker.city];
  const pressFrame = {
    height: markerTargetSize,
    width: markerTargetSize,
    x: anchor.x + placement.pressOffsetX,
    y: anchor.y + placement.pressOffsetY,
  };

  return {
    anchor,
    labelFrame: {
      height: placement.label.height,
      width: placement.label.width,
      x: anchor.x + placement.label.offsetX,
      y: anchor.y + placement.label.offsetY,
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

function savedMemoryLabel(city: City, visitCount: number) {
  return `${cityContent[city].name}，已保存 ${visitCount} 册旅行记忆`;
}

export function CityMap({ stats, variant, interactive = false, onCityPress }: CityMapProps) {
  const adapter = new OfflineChinaMapAdapter();
  const statsByCity = new Map(stats.map((stat) => [stat.city, stat]));
  const outlinePoints = adapter.outline.points.map(({ x, y }) => `${x * 300},${y * 210}`).join(" ");

  return (
    <View
      accessibilityLabel={variant === "overview" ? "离线中国城市旅行地图概览" : "离线中国城市旅行地图工作区"}
      style={{ aspectRatio: 300 / 210, backgroundColor: "#EEF2EE", borderRadius: 20, overflow: "hidden" }}
    >
      <Svg height="100%" width="100%" viewBox="0 0 300 210">
        <Polygon fill="#DDEBDD" points={outlinePoints} stroke={colors.accent} strokeWidth={2} />
      </Svg>
      {adapter.markers.map((marker) => {
        const { city, coordinate } = marker;
        const stat = statsByCity.get(city) ?? {
          city,
          visitCount: 0,
          unlocked: false,
          isVisited: false,
          intensity: "none" as const,
        };
        const token = markerTokens[stat.intensity];
        const label = savedMemoryLabel(city, stat.visitCount);
        const layout = resolveCityMarkerLayout(marker);
        const pressOffsetX = layout.pressFrame.x - layout.anchor.x;
        const pressOffsetY = layout.pressFrame.y - layout.anchor.y;
        const markerOffsetX = layout.markerFrame.x - layout.pressFrame.x;
        const markerOffsetY = layout.markerFrame.y - layout.pressFrame.y;

        return (
          <Pressable
            key={city}
            accessibilityLabel={label}
            accessibilityRole="button"
            disabled={!interactive}
            onPress={() => onCityPress?.(city)}
            style={({ pressed }) => ({
              height: markerTargetSize,
              left: `${coordinate.x * 100}%`,
              minHeight: markerTargetSize,
              minWidth: markerTargetSize,
              opacity: pressed ? 0.82 : 1,
              position: "absolute",
              top: `${coordinate.y * 100}%`,
              transform: [{ translateX: pressOffsetX }, { translateY: pressOffsetY }],
              width: markerTargetSize,
            })}
            testID={`city-map-marker-${city}-${stat.intensity}`}
          >
            <View
              style={{
                backgroundColor: token.fill,
                borderColor: token.border,
                borderRadius: markerVisualSize / 2,
                borderWidth: 3,
                height: markerVisualSize,
                left: markerOffsetX,
                position: "absolute",
                top: markerOffsetY,
                width: markerVisualSize,
              }}
            />
            <Text
              selectable
              style={{
                color: colors.ink,
                fontSize: 12,
                fontWeight: "800",
                left: layout.labelFrame.x - layout.pressFrame.x,
                position: "absolute",
                top: layout.labelFrame.y - layout.pressFrame.y,
                width: layout.labelFrame.width,
              }}
            >
              {cityContent[city].name} · {stat.visitCount} 册
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type { CityMapProps, CityMapVariant };
