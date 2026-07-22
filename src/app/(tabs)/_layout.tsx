import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShadowVisible: false }}>
      <Tabs.Screen name="index" options={{ title: "记忆" }} />
      <Tabs.Screen name="cities" options={{ title: "城市" }} />
      <Tabs.Screen name="profile" options={{ title: "我的" }} />
    </Tabs>
  );
}
