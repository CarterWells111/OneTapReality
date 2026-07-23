import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 6 }} testID="fullscreen-city-map-header">
        <View>
          <Text selectable style={{ color: colors.ink, fontSize: 15, fontWeight: "800" }}>中国旅行地图</Text>
        </View>
        <Pressable accessibilityLabel="关闭全屏地图" accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => ({ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: "center", opacity: pressed ? 0.82 : 1, width: 36 })} testID="fullscreen-city-map-close">
          <Text selectable style={{ color: colors.ink, fontWeight: "800" }}>关闭</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, padding: 4 }} testID="fullscreen-city-map-viewport">
        <CityMap stats={cityStats} variant="workspace" interactive onCityPress={goToCity} />
      </View>
    </SafeAreaView>
  );
}
