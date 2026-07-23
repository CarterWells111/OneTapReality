import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors, serifFont } from "../components/ui";
import { MemoriesProvider } from "../features/memories/memories-provider";
import { ProfileProvider } from "../features/profile/profile-provider";
import { migrateDbIfNeeded } from "../storage/memory-repository";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SQLiteProvider databaseName="luyi.db" onInit={migrateDbIfNeeded}>
          <ProfileProvider>
            <MemoriesProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerBackButtonDisplayMode: "minimal",
                  headerShadowVisible: false,
                  headerStyle: { backgroundColor: colors.background },
                  headerTintColor: colors.ink,
                  headerTitleStyle: { fontFamily: serifFont, fontWeight: "700" },
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="memory/new" options={{ title: "创建纪念册" }} />
              <Stack.Screen name="memory/review/[id]" options={{ title: "确认草稿" }} />
              <Stack.Screen name="memory/[id]" options={{ title: "旅行册" }} />
              <Stack.Screen name="memory/[id]/edit" options={{ title: "编辑旅行册" }} />
              <Stack.Screen name="city/[city]" options={{ title: "城市收藏" }} />
              <Stack.Screen name="city/[city]/manage" options={{ title: "Manage city collection" }} />
              <Stack.Screen name="city-map/index" options={{ headerShown: false, presentation: "fullScreenModal" }} />
              <Stack.Screen name="nfc-demo/[city]" options={{ title: "模拟碰一碰" }} />
              <Stack.Screen name="shop/[skuId]" options={{ title: "纪念品详情" }} />
              <Stack.Screen name="shop/orders" options={{ title: "订单记录" }} />
              <Stack.Screen name="shop/favorites" options={{ title: "我的收藏" }} />
              <Stack.Screen name="recycle-bin/index" options={{ title: "回收站" }} />
              <Stack.Screen name="feedback/index" options={{ title: "意见反馈" }} />
              <Stack.Screen name="settings/index" options={{ title: "设置" }} />
              <Stack.Screen name="backend/index" options={{ title: "后端实验" }} />
              <Stack.Screen name="privacy/index" options={{ title: "本机数据与隐私声明" }} />
              </Stack>
            </MemoriesProvider>
          </ProfileProvider>
        </SQLiteProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

