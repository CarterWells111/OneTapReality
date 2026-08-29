import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { bodyFont, colors, PaperCard, ScreenTitle, Section, serifFont, Tag } from "../../components/ui";
import { CityMap } from "../../features/cities/city-map";
import { getCityArchiveCities } from "../../features/cities/city-archive";
import { CityCard } from "../../features/cities/city-card";
import { getCityCheckinMapImage } from "../../features/cities/city-checkin-map-images";
import { getCityStats } from "../../features/cities/city-stats";
import { useMemories } from "../../features/memories/memories-provider";
import type { City } from "../../types/memory";

export default function CitiesScreen() {
  const router = useRouter();
  const { memories } = useMemories();
  const cityStats = getCityStats(memories);
  const cityStatsByCity = new Map(cityStats.map((stat) => [stat.city, stat]));
  const archiveCities = getCityArchiveCities(memories);
  // 城市档案卡片/入口始终进入城市记忆页
  const goToCity = (city: City) => router.push({ pathname: "/city/[city]", params: { city } });
  // 地图上的城市标记：有打卡地图的城市进全屏大图，其余进城市记忆页
  const handleMapCityPress = (city: City) => {
    if (getCityCheckinMapImage(city)) router.push({ pathname: "/city-map/[city]", params: { city } });
    else router.push({ pathname: "/city/[city]", params: { city } });
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.screen}
    >
      <ScreenTitle title="城市" caption="CITY MEMORIES" />

      <Section title="城市旅行地图" caption="MY MAP">
        <PaperCard tone="paper" style={styles.mapCard}>
          <Tag label="足迹总览" />
          <Text selectable style={styles.mapNote}>
            每一册旅行记忆，都会在这张地图上，往你的收藏册里落下一枚城市印章。
          </Text>
          <CityMap
            stats={cityStats}
            variant="overview"
            interactive
            onCityPress={handleMapCityPress}
            onMapPress={() => router.push("/city-map")}
          />
        </PaperCard>
      </Section>

      <Section title="城市档案" caption="CITY FILES">
        <Text selectable style={styles.listIntro}>
          也可从这份档案里，翻看每座城市已经收进册子的旅行记忆。
        </Text>
        <View style={styles.list}>
          {archiveCities.map((city) => {
            const stat = cityStatsByCity.get(city)!;
            return <CityCard city={city} key={city} onPress={() => goToCity(city)} variant={stat.isVisited ? "visited" : "unvisited"} visitCount={stat.visitCount} />;
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/cities/unvisited")}
            style={({ pressed }) => [styles.moreCitiesCard, pressed && styles.pressed]}
            testID="more-cities-entry"
          >
            <View style={styles.moreCitiesHeader}>
              <Text selectable style={styles.moreCitiesTitle}>查看更多城市</Text>
              <Text selectable style={styles.moreCitiesChevron}>›</Text>
            </View>
            <Text selectable style={styles.moreCitiesSubtitle}>下一段旅行，正等着被写进你的城市档案。</Text>
          </Pressable>
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { gap: 22, padding: 20, paddingTop: 12, paddingBottom: 36 },
  mapCard: { gap: 12 },
  mapNote: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22 },
  listIntro: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22 },
  list: { gap: 12 },
  moreCitiesHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  moreCitiesChevron: { color: colors.accent, fontSize: 22, opacity: 0.7 },
  moreCitiesCard: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderRadius: 18, borderWidth: 1, gap: 8, minHeight: 84, padding: 18 },
  moreCitiesTitle: { color: colors.accent, fontFamily: serifFont, fontSize: 19, fontWeight: "800" },
  moreCitiesSubtitle: { color: colors.muted, fontFamily: bodyFont, fontSize: 13.5, lineHeight: 20 },
  pressed: { opacity: 0.85 },
});
