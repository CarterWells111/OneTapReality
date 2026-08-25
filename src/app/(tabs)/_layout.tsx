import { Tabs } from "expo-router";
import { Image, StyleSheet, type ImageSourcePropType } from "react-native";

import { colors } from "../../components/ui";
import { headingFontFamily } from "../../features/typography/fonts";

type TabName = "memory" | "city" | "profile";

const tabIcons: Record<TabName, ImageSourcePropType> = {
  memory: require("../../../assets/tab-icons/tab-memory.png"),
  city: require("../../../assets/tab-icons/tab-city.png"),
  profile: require("../../../assets/tab-icons/tab-profile.png"),
};

/** 版本 2 底部 UI 图标，透明底图片随应用打包。 */
function TabIcon({ focused, name }: { focused: boolean; name: TabName }) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={tabIcons[name]}
      style={[styles.tabIcon, !focused && styles.tabIconInactive]}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.warmAccent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontFamily: headingFontFamily,
          fontSize: 12,
          fontWeight: "700",
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 96,
          paddingBottom: 16,
          paddingTop: 7,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "记忆",
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="memory" />,
        }}
      />
      <Tabs.Screen
        name="cities"
        options={{
          title: "城市",
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="city" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我的",
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="profile" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    height: 56,
    width: 56,
  },
  tabIconInactive: {
    opacity: 0.58,
  },
});
