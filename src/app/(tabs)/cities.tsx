import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { getUnlockedCities } from "../../features/cities/city-unlocks";
import { useMemories } from "../../features/memories/memories-provider";
import { cities } from "../../types/memory";

export default function CitiesScreen() {
  const router = useRouter();
  const { memories } = useMemories();
  const unlockedCities = getUnlockedCities(memories);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <Section title="城市记忆地图">
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          保存该城市的旅行册后即可解锁它的收藏状态。现在所有城市都可预览。
        </Text>
        <View style={{ gap: 12 }}>
          {cities.map((city) => {
            const item = cityContent[city];
            const unlocked = unlockedCities.includes(city);
            return (
              <Pressable
                key={city}
                onPress={() => router.push({ pathname: "/city/[city]", params: { city } })}
                style={({ pressed }) => ({
                  backgroundColor: item.color,
                  borderRadius: 18,
                  gap: 8,
                  opacity: pressed ? 0.85 : 1,
                  padding: 18,
                })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text selectable style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
                    {item.name}
                  </Text>
                  <Text selectable style={{ color: colors.accent, fontWeight: "700" }}>
                    {unlocked ? "已解锁" : "可预览"}
                  </Text>
                </View>
                <Text selectable style={{ color: colors.muted }}>{item.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </ScrollView>
  );
}

