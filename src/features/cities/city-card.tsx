import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { colors, serifFont } from "../../components/ui";
import type { City } from "../../types/city";
import { cityContent } from "./city-content";
import { getCityCardVisual } from "./city-illustrations";

type CityCardProps = {
  readonly city: City;
  readonly visitCount?: number;
  readonly onPress: () => void;
  readonly variant: "visited" | "unvisited";
};

function GenericCityIllustration({ city }: { readonly city: City }) {
  return (
    <View style={styles.genericIllustration} testID={`city-card-generic-${city}`}>
      <Svg height="100%" viewBox="0 0 118 92" width="100%">
        <Circle cx="88" cy="24" fill="none" r="10" stroke={colors.accent} strokeWidth="1.5" />
        <Path d="M10 69C25 54 36 58 48 47C60 36 68 53 80 45C92 37 100 43 109 31" fill="none" stroke={colors.accent} strokeLinecap="round" strokeWidth="1.8" />
        <Path d="M11 77H108M23 61V77M48 52V77M73 57V77M96 48V77" fill="none" stroke={colors.muted} strokeLinecap="round" strokeWidth="1.2" />
      </Svg>
    </View>
  );
}

export function CityCard({ city, visitCount = 0, onPress, variant }: CityCardProps) {
  const content = cityContent[city];
  const visual = getCityCardVisual(city);
  const isVisited = variant === "visited";
  const state = isVisited ? `已保存 ${visitCount} 册旅行记忆` : "尚未打卡";
  const detail = isVisited ? content.subtitle : content.discoverySlogan;

  return (
    <Pressable
      accessibilityLabel={`${content.name}城市卡片`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: content.color }, pressed && styles.pressed]}
      testID={`city-archive-card-${city}`}
    >
      <View style={styles.copy}>
        <View style={styles.header}>
          <Text selectable style={styles.name}>{content.name}</Text>
          <Text selectable style={styles.chevron}>›</Text>
        </View>
        <View style={styles.stateRow}>
          <View style={[styles.stampDot, !isVisited && styles.unvisitedDot]} />
          <Text selectable style={[styles.state, isVisited && styles.visitedState]}>{state}</Text>
        </View>
        <Text selectable style={styles.detail}>{detail}</Text>
      </View>
      <View style={styles.visual} testID={`city-card-visual-${city}`}>
        {visual.kind === "illustration" ? (
          <Image accessibilityLabel={`${content.name}插画`} resizeMode="cover" source={visual.source} style={styles.illustration} testID={`city-card-illustration-${city}`} />
        ) : (
          <GenericCityIllustration city={city} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderColor: colors.paperEdge,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    height: 132,
    overflow: "hidden",
    padding: 14,
  },
  copy: { flex: 1, gap: 7, justifyContent: "center", minWidth: 0 },
  header: { alignItems: "center", flexDirection: "row", gap: 5, justifyContent: "space-between" },
  name: { color: colors.ink, fontFamily: serifFont, fontSize: 21, fontWeight: "800" },
  chevron: { color: colors.ink, fontSize: 22, opacity: 0.5 },
  stateRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  stampDot: { backgroundColor: colors.warmAccent, borderRadius: 5, height: 9, width: 9 },
  unvisitedDot: { backgroundColor: colors.muted, opacity: 0.5 },
  state: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  visitedState: { color: colors.warmAccent },
  detail: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  visual: { flexShrink: 0, height: 100, justifyContent: "center", width: 112 },
  illustration: { borderColor: "rgba(85, 70, 54, 0.12)", borderRadius: 12, borderWidth: 1, height: 100, width: "100%" },
  genericIllustration: { alignItems: "center", backgroundColor: colors.paper, borderColor: colors.paperEdge, borderRadius: 12, borderWidth: 1, height: 100, justifyContent: "center", overflow: "hidden", width: "100%" },
  pressed: { opacity: 0.85 },
});
