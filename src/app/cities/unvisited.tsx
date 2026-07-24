import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, PaperCard, ScreenTitle, Section, serifFont, Tag } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { getCityStats } from "../../features/cities/city-stats";
import { useMemories } from "../../features/memories/memories-provider";
import type { City } from "../../types/memory";

export default function UnvisitedCitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { memories, isReady } = useMemories();
  const unvisitedCities = isReady ? getCityStats(memories).filter((stat) => !stat.isVisited) : [];
  const goToCity = (city: City) => router.push({ pathname: "/city/[city]", params: { city } });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      style={styles.screen}
    >
      <ScreenTitle title="未打卡城市" caption="DISCOVER MORE" />

      <Section title="下一站，去哪里？" caption="NEXT STOPS">
        {!isReady ? (
          <PaperCard tone="paper" style={styles.loadingCard}>
            <Text selectable style={styles.loadingCopy}>正在整理城市足迹…</Text>
          </PaperCard>
        ) : unvisitedCities.length === 0 ? (
          <PaperCard tone="paper" style={styles.completionCard}>
            <Tag label="旅程完成" />
            <Text selectable style={styles.completionTitle}>已点亮全部城市</Text>
            <Text selectable style={styles.completionCopy}>每座城市都已经有了属于你的旅行记忆，慢慢翻阅这些珍藏吧。</Text>
          </PaperCard>
        ) : (
          <View style={styles.list}>
            {unvisitedCities.map(({ city }) => {
              const item = cityContent[city];
              return (
                <Pressable
                  key={city}
                  accessibilityRole="button"
                  onPress={() => goToCity(city)}
                  style={({ pressed }) => [styles.cityCard, { backgroundColor: item.color }, pressed && styles.pressed]}
                >
                  <View style={styles.cityHeader}>
                    <Text selectable style={styles.cityName}>{item.name}</Text>
                    <Text selectable style={styles.cityChevron}>›</Text>
                  </View>
                  <View style={styles.stateRow}>
                    <View style={styles.stampDot} />
                    <Text selectable style={styles.cityState}>尚未打卡</Text>
                  </View>
                  <Text selectable style={styles.citySlogan}>{item.discoverySlogan}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { gap: 22, padding: 20, paddingBottom: 36 },
  list: { gap: 12 },
  cityCard: { borderColor: colors.paperEdge, borderRadius: 18, borderWidth: 1, gap: 8, minHeight: 112, padding: 18 },
  cityHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cityName: { color: colors.ink, fontFamily: serifFont, fontSize: 21, fontWeight: "800" },
  cityChevron: { color: colors.ink, fontSize: 22, opacity: 0.5 },
  stateRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  stampDot: { backgroundColor: colors.muted, borderRadius: 5, height: 9, opacity: 0.5, width: 9 },
  cityState: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  citySlogan: { color: colors.muted, fontSize: 13.5, lineHeight: 20 },
  loadingCard: { minHeight: 96, justifyContent: "center" },
  loadingCopy: { color: colors.muted, fontSize: 14, textAlign: "center" },
  completionCard: { gap: 10 },
  completionTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 23, fontWeight: "800" },
  completionCopy: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  pressed: { opacity: 0.85 },
});
