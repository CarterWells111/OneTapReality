import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { bodyFont, colors, serifFont } from "../../components/ui";
import { CityMap } from "../../features/cities/city-map";
import { CityCheckinModal } from "../../features/cities/city-checkin-modal";
import { getCityStats } from "../../features/cities/city-stats";
import { useMemories } from "../../features/memories/memories-provider";
import { cityContent } from "../../features/cities/city-content";
import { cityRegistry, type City } from "../../types/city";
import { checkinCities } from "../../features/cities/city-checkin-images";



/** 城市搜索列表（中文名 + ID 索引） */
const citySearchEntries = cityRegistry
  .map((entry) => ({
    id: entry.id as City,
    name: cityContent[entry.id as City]?.name ?? entry.name,
  }));

export default function FullscreenCityMapScreen() {
  const router = useRouter();
  const { memories } = useMemories();
  const cityStats = getCityStats(memories);
  const [targetCity, setTargetCity] = React.useState<City | undefined>(undefined);
  const [checkinCity, setCheckinCity] = React.useState<City | undefined>(undefined);
  const [searchText, setSearchText] = React.useState("");
  const [filteredCities, setFilteredCities] = React.useState<typeof citySearchEntries>([]);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const searchInputRef = React.useRef<TextInput>(null);

  const handleCityPress = React.useCallback((city: City) => {
    if (checkinCities.includes(city)) {
      setCheckinCity(city);
    } else {
      router.push({ pathname: "/city/[city]", params: { city } });
    }
  }, [router]);

  const handleSearch = React.useCallback((text: string) => {
    setSearchText(text);
    if (text.trim().length === 0) {
      setFilteredCities([]);
      setShowDropdown(false);
      return;
    }
    const term = text.trim().toLowerCase();
    const filtered = citySearchEntries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) ||
        entry.id.toLowerCase().includes(term),
    );
    setFilteredCities(filtered);
    setShowDropdown(filtered.length > 0);
  }, []);

  const handleSelectCity = React.useCallback((city: City) => {
    setSearchText("");
    setShowDropdown(false);
    setTargetCity(city);
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={styles.screen} testID="fullscreen-city-map-screen">
      {/* 头部：标题 + 搜索框 + 关闭 */}
      <View style={styles.header} testID="fullscreen-city-map-header">
        <View style={styles.headerLeft}>
          <Text selectable style={styles.headerTitle}>中国旅行地图</Text>
          <Text selectable style={styles.headerSubtitle}>点击城市标记，探索你的旅行足迹</Text>
        </View>
        <Pressable
          accessibilityLabel="关闭全屏地图"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          testID="fullscreen-city-map-close"
        >
          <Text selectable style={styles.closeBtnText}>关闭</Text>
        </Pressable>
      </View>

      {/* 搜索栏 */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            placeholder="搜索城市，快速跳转…"
            placeholderTextColor={colors.muted}
            onChangeText={handleSearch}
            onFocus={() => {
              if (filteredCities.length > 0) setShowDropdown(true);
            }}
            onBlur={() => {
              // 延迟关闭，让 onPress 有机会触发
              setTimeout(() => setShowDropdown(false), 150);
            }}
            ref={searchInputRef}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchText}
          />
          {searchText.length > 0 ? (
            <Pressable
              hitSlop={{ bottom: 8, left: 8, right: 8, top: 8 }}
              onPress={() => { setSearchText(""); setShowDropdown(false); }}
            >
              <Text style={styles.clearIcon}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* 下拉建议 */}
        {showDropdown && filteredCities.length > 0 ? (
          <View style={styles.dropdown}>
            {filteredCities.slice(0, 8).map((entry) => (
              <Pressable
                accessibilityLabel={`搜索跳转至${entry.name}`}
                accessibilityRole="button"
                key={entry.id}
                onPress={() => handleSelectCity(entry.id)}
                style={({ pressed }) => [styles.dropdownItem, pressed && styles.dropdownItemPressed]}
              >
                <Text selectable style={styles.dropdownName}>{entry.name}</Text>
                <Text selectable style={styles.dropdownId}>{entry.id}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* 地图视口 */}
      <View style={styles.viewport} testID="fullscreen-city-map-viewport">
        <CityMap
          stats={cityStats}
          variant="workspace"
          interactive
          onCityPress={handleCityPress}
          targetCity={targetCity}
          onTargetReached={() => setTargetCity(undefined)}
        />
      </View>

      {/* 城市打卡弹窗 */}
      {checkinCity ? (
        <CityCheckinModal
          city={checkinCity}
          onClose={() => setCheckinCity(undefined)}
          visible
        />
      ) : null}
    </SafeAreaView>
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
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  headerLeft: {
    gap: 3,
  },
  headerTitle: {
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 22,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
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
  closeBtnText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  pressed: { opacity: 0.82 },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 100,
  },
  searchBar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearIcon: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800",
  },
  dropdown: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    overflow: "hidden",
    shadowColor: colors.ink,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  dropdownItem: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dropdownItemPressed: {
    backgroundColor: colors.accentSoft,
  },
  dropdownName: {
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 16,
    fontWeight: "800",
  },
  dropdownId: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
  },
  viewport: {
    flex: 1,
    padding: 4,
  },
});
