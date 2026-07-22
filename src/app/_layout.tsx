import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";

import { MemoriesProvider } from "../features/memories/memories-provider";
import { migrateDbIfNeeded } from "../storage/memory-repository";

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="luyi.db" onInit={migrateDbIfNeeded}>
      <MemoriesProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="memory/new" options={{ title: "创建纪念册" }} />
          <Stack.Screen name="memory/review/[id]" options={{ title: "确认草稿" }} />
          <Stack.Screen name="memory/[id]" options={{ title: "旅行册" }} />
          <Stack.Screen name="memory/[id]/edit" options={{ title: "编辑旅行册" }} />
          <Stack.Screen name="city/[city]" options={{ title: "城市收藏" }} />
          <Stack.Screen name="nfc-demo/[city]" options={{ title: "模拟碰一碰" }} />
        </Stack>
      </MemoriesProvider>
    </SQLiteProvider>
  );
}

