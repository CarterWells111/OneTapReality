import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { bodyFont, colors, serifFont } from "../components/ui";
import { PageCaptureProvider } from "../features/export/page-capture-provider";
import { AuthProvider } from "../features/auth/auth-provider";
import { MemoriesProvider } from "../features/memories/memories-provider";
import { ProfileProvider } from "../features/profile/profile-provider";
import { appFontSources } from "../features/typography/fonts";
import { migrateDbIfNeeded } from "../storage/memory-repository";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFontSources);
  if (fontError) {
    console.error("[RootLayout] 字体加载失败：", fontError);
  }
  if (!fontsLoaded && !fontError) {
    return null;
  }
  configureDefaultTypography();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SQLiteProvider databaseName="luyi.db" onInit={migrateDbIfNeeded}>
          <AuthProvider>
          <ProfileProvider>
            <MemoriesProvider>
              <PageCaptureProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerBackButtonDisplayMode: "minimal",
                  headerShadowVisible: false,
                  headerStyle: { backgroundColor: colors.background },
                  headerTintColor: colors.ink,
                  headerTitleStyle: { fontFamily: serifFont },
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ title: "登录" }} />
              <Stack.Screen name="gifts/index" options={{ title: "我的纪念品" }} />
              <Stack.Screen name="gifts/shared/[id]" options={{ title: "分享相册" }} />
              <Stack.Screen name="gift/[token]" options={{ title: "NFC 纪念礼品" }} />
              <Stack.Screen name="memory/new" options={{ title: "创建纪念册" }} />
              <Stack.Screen name="memory/review/[id]" options={{ title: "确认草稿" }} />
              <Stack.Screen name="memory/[id]" options={{ title: "旅行册" }} />
              <Stack.Screen name="memory/[id]/edit" options={{ title: "编辑旅行册" }} />
              <Stack.Screen name="city/[city]" options={{ title: "城市收藏" }} />
              <Stack.Screen name="cities/unvisited" options={{ title: "未打卡城市" }} />
              <Stack.Screen name="city/[city]/manage" options={{ title: "Manage city collection" }} />
              <Stack.Screen name="city-map/index" options={{ headerShown: false, presentation: "fullScreenModal" }} />
              <Stack.Screen name="nfc-demo/[city]" options={{ title: "城市钥匙" }} />
              <Stack.Screen name="shop/[skuId]" options={{ headerShown: false }} />
              <Stack.Screen name="shop/orders" options={{ title: "购物袋" }} />
              <Stack.Screen name="shop/favorites" options={{ title: "我的收藏" }} />
              <Stack.Screen name="recycle-bin/index" options={{ title: "回收站" }} />
              <Stack.Screen name="feedback/index" options={{ title: "意见反馈" }} />
              <Stack.Screen name="settings/index" options={{ title: "设置" }} />
              <Stack.Screen name="backend/index" options={{ title: "后端状态" }} />
              <Stack.Screen name="privacy/index" options={{ title: "数据与隐私" }} />
              </Stack>
            </PageCaptureProvider>
            </MemoriesProvider>
          </ProfileProvider>
          </AuthProvider>
        </SQLiteProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function configureDefaultTypography() {
  const defaultTextProps = (Text as unknown as { defaultProps?: { style?: unknown; allowFontScaling?: boolean } });
  defaultTextProps.defaultProps = {
    ...defaultTextProps.defaultProps,
    allowFontScaling: defaultTextProps.defaultProps?.allowFontScaling ?? true,
    style: [{ fontFamily: bodyFont }, defaultTextProps.defaultProps?.style],
  };

  const defaultInputProps = (TextInput as unknown as { defaultProps?: { style?: unknown; allowFontScaling?: boolean } });
  defaultInputProps.defaultProps = {
    ...defaultInputProps.defaultProps,
    allowFontScaling: defaultInputProps.defaultProps?.allowFontScaling ?? true,
    style: [{ fontFamily: bodyFont }, defaultInputProps.defaultProps?.style],
  };
}

