import { Pressable, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";

import { colors } from "../../components/ui";
import type { City } from "../../types/memory";
import { cityContent } from "./city-content";
import { OfflineChinaMapAdapter, type CityMapFocus } from "./city-map-adapter";
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
      {adapter.markers.map(({ city, coordinate }) => {
        const stat = statsByCity.get(city) ?? {
          city,
          visitCount: 0,
          unlocked: false,
          isVisited: false,
          intensity: "none" as const,
        };
        const token = markerTokens[stat.intensity];
        const label = savedMemoryLabel(city, stat.visitCount);

        return (
          <Pressable
            key={city}
            accessibilityLabel={label}
            accessibilityRole="button"
            disabled={!interactive}
            onPress={() => onCityPress?.(city)}
            style={({ pressed }) => ({
              alignItems: "center",
              left: `${coordinate.x * 100}%`,
              minHeight: 44,
              minWidth: 44,
              opacity: pressed ? 0.82 : 1,
              position: "absolute",
              top: `${coordinate.y * 100}%`,
              transform: [{ translateX: -22 }, { translateY: -22 }],
            })}
            testID={`city-map-marker-${city}-${stat.intensity}`}
          >
            <View style={{ backgroundColor: token.fill, borderColor: token.border, borderRadius: 12, borderWidth: 3, height: 18, width: 18 }} />
            <Text selectable style={{ color: colors.ink, fontSize: 12, fontWeight: "800", marginTop: 2 }}>
              {cityContent[city].name} · {stat.visitCount} 册
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type { CityMapProps, CityMapVariant };
