import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { colors, Section } from "../../components/ui";
import { CityMap } from "../../features/cities/city-map";
import { cityContent } from "../../features/cities/city-content";
import { getCityStats } from "../../features/cities/city-stats";
import { useMemories } from "../../features/memories/memories-provider";
import type { City } from "../../types/memory";

export default function CitiesScreen() {
  const router = useRouter();
  const { memories } = useMemories();
  const cityStats = getCityStats(memories);
  const goToCity = (city: City) => router.push({ pathname: "/city/[city]", params: { city } });

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <Section title="城市旅行地图">
        <Text selectable style={{ color: colors.accent, fontSize: 14, fontWeight: "800" }}>
          OneTapReality · 一触如初
        </Text>
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          每一册本地保存的旅行记忆，都会在这张离线地图上留下城市足迹。
        </Text>
        <CityMap stats={cityStats} variant="overview" interactive onCityPress={goToCity} onMapPress={() => router.push("/city-map")} />
      </Section>
      <Section title="城市文字列表">
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          也可从文字列表查看每座城市已保存的旅行记忆。
        </Text>
        <View style={{ gap: 12 }}>
          {cityStats.map((stat) => {
            const { city } = stat;
            const item = cityContent[city];
            const visitState = stat.isVisited ? `已保存 ${stat.visitCount} 册旅行记忆` : "尚未保存旅行记忆";
            return (
              <Pressable
                key={city}
                accessibilityRole="button"
                onPress={() => goToCity(city)}
                style={({ pressed }) => ({
                  backgroundColor: item.color,
                  borderRadius: 18,
                  gap: 8,
                  minHeight: 88,
                  opacity: pressed ? 0.85 : 1,
                  padding: 18,
                })}
              >
                <Text selectable style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
                  {item.name} · {visitState}
                </Text>
                <Text selectable style={{ color: colors.muted }}>{item.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </ScrollView>
  );
}

