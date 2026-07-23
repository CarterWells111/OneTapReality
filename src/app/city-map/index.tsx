import { useRouter } from "expo-router";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { colors } from "../../components/ui";
import { CityMap } from "../../features/cities/city-map";
import { getCityStats } from "../../features/cities/city-stats";
import { useMemories } from "../../features/memories/memories-provider";
import type { City } from "../../types/memory";

export default function FullscreenCityMapScreen() {
  const router = useRouter();
  const { memories } = useMemories();
  const cityStats = getCityStats(memories);
  const goToCity = (city: City) => router.push({ pathname: "/city/[city]", params: { city } });

  return (
    <SafeAreaView style={{ backgroundColor: colors.background, flex: 1 }} testID="fullscreen-city-map-screen">
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", padding: 20 }}>
        <View>
          <Text selectable style={{ color: colors.ink, fontSize: 22, fontWeight: "800" }}>中国旅行地图</Text>
          <Text selectable style={{ color: colors.muted, marginTop: 4 }}>双指缩放，单指平移</Text>
        </View>
        <Pressable accessibilityLabel="关闭全屏地图" accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => ({ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 16, borderWidth: 1, opacity: pressed ? 0.82 : 1, paddingHorizontal: 14, paddingVertical: 10 })}>
          <Text selectable style={{ color: colors.ink, fontWeight: "800" }}>关闭</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: "center", padding: 16 }}>
        <CityMap stats={cityStats} variant="workspace" interactive onCityPress={goToCity} />
      </View>
    </SafeAreaView>
  );
}
