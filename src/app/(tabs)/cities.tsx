import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, PaperCard, ScreenTitle, Section, serifFont, Tag } from "../../components/ui";
import { CityMap } from "../../features/cities/city-map";
import { cityContent } from "../../features/cities/city-content";
import { getCityStats } from "../../features/cities/city-stats";
import { useMemories } from "../../features/memories/memories-provider";
import type { City } from "../../types/memory";

export default function CitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { memories } = useMemories();
  const cityStats = getCityStats(memories);
  const goToCity = (city: City) => router.push({ pathname: "/city/[city]", params: { city } });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      style={styles.screen}
    >
      <ScreenTitle title="城市" caption="CITY MEMORIES" />

      <Section title="城市旅行地图" caption="MY MAP">
        <PaperCard tone="paper" style={styles.mapCard}>
          <Tag label="足迹总览" />
          <Text selectable style={styles.mapNote}>
            每一册本地保存的旅行记忆，都会在这张离线地图上，往你的收藏册里落下一枚城市印章。
          </Text>
          <CityMap
            stats={cityStats}
            variant="overview"
            interactive
            onCityPress={goToCity}
            onMapPress={() => router.push("/city-map")}
          />
        </PaperCard>
      </Section>

      <Section title="城市档案" caption="CITY FILES">
        <Text selectable style={styles.listIntro}>
          也可从这份档案里，翻看每座城市已经收进册子的旅行记忆。
        </Text>
        <View style={styles.list}>
          {cityStats.map((stat) => {
            const { city } = stat;
            const item = cityContent[city];
            const visitState = stat.isVisited ? `已保存 ${stat.visitCount} 册旅行记忆` : "尚未保存旅行记忆";
            return (
              <Pressable
                key={city}
                accessibilityRole="button"
                onPress={() => goToCity(city)}
                style={({ pressed }) => [
                  styles.cityCard,
                  { backgroundColor: item.color },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.cityHeader}>
                  <Text selectable style={styles.cityName}>{item.name}</Text>
                  <Text selectable style={styles.cityChevron}>›</Text>
                </View>
                <View style={styles.stateRow}>
                  <View style={[styles.stampDot, !stat.isVisited && styles.stampDotMuted]} />
                  <Text selectable style={[styles.cityState, stat.isVisited && styles.cityStateVisited]}>
                    {visitState}
                  </Text>
                </View>
                <Text selectable style={styles.citySubtitle}>{item.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { gap: 22, padding: 20, paddingBottom: 36 },
  mapCard: { gap: 12 },
  mapNote: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  listIntro: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  list: { gap: 12 },
  cityCard: {
    borderColor: colors.paperEdge,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    minHeight: 96,
    padding: 18,
  },
  cityHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cityName: { color: colors.ink, fontFamily: serifFont, fontSize: 21, fontWeight: "800" },
  cityChevron: { color: colors.ink, fontSize: 22, opacity: 0.5 },
  stateRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  stampDot: { backgroundColor: colors.warmAccent, borderRadius: 5, height: 9, width: 9 },
  stampDotMuted: { backgroundColor: colors.muted, opacity: 0.5 },
  cityState: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  cityStateVisited: { color: colors.warmAccent },
  citySubtitle: { color: colors.muted, fontSize: 13.5, lineHeight: 20 },
  pressed: { opacity: 0.85 },
});
