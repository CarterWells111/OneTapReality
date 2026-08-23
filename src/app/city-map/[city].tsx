import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bodyFont, colors, serifFont } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { getCityCheckinMapImage } from "../../features/cities/city-checkin-map-images";
import { resolveCityRouteParam } from "../../features/cities/city-route";

export default function CityCheckinMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ city?: string }>();
  const city = resolveCityRouteParam(typeof params.city === "string" ? params.city : undefined);
  const content = cityContent[city];
  const source = getCityCheckinMapImage(city);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="city-checkin-map-screen">
      <View style={styles.header} testID="city-checkin-map-header">
        <View style={styles.headerLeft}>
          <Text selectable style={styles.cityName}>{content.name}</Text>
          <Text selectable style={styles.subtitle}>城市打卡地图</Text>
        </View>
        <Pressable
          accessibilityLabel="关闭打卡地图"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          testID="city-checkin-map-close"
        >
          <Text selectable style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {source ? (
        <Image
          accessibilityLabel={`${content.name}城市打卡地图`}
          resizeMode="contain"
          source={source}
          style={styles.image}
          testID="city-checkin-map-image"
        />
      ) : (
        <View style={styles.placeholder} testID="city-checkin-map-placeholder">
          <Text selectable style={styles.placeholderTitle}>{content.name}</Text>
          <Text selectable style={styles.placeholderText}>打卡地图筹备中</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerLeft: {
    gap: 2,
  },
  cityName: {
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.warmAccent,
    fontFamily: bodyFont,
    fontSize: 13,
    letterSpacing: 2,
  },
  closeBtn: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  closeText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  pressed: { opacity: 0.82 },
  image: {
    flex: 1,
    width: "100%",
  },
  placeholder: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  placeholderTitle: {
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 24,
    fontWeight: "800",
  },
  placeholderText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
  },
});
