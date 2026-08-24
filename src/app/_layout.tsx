import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors, serifFont } from "../components/ui";
import { PageCaptureProvider } from "../features/export/page-capture-provider";
import { AuthProvider } from "../features/auth/auth-provider";
import { MemoriesProvider } from "../features/memories/memories-provider";
import { ProfileProvider } from "../features/profile/profile-provider";
import { FontLoadingProvider } from "../features/typography/font-loading-provider";
import { migrateDbIfNeeded } from "../storage/memory-repository";

export default function RootLayout() {
  configureDefaultTypography();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <FontLoadingProvider>
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
              <Stack.Screen name="gifts/shared/[id]/edit" options={{ title: "编辑共享相册" }} />
              <Stack.Screen name="gift/[token]" options={{ title: "NFC 纪念礼品" }} />
              <Stack.Screen name="memory" options={{ headerShown: false }} />
              <Stack.Screen name="city/[city]" options={{ title: "城市收藏" }} />
              <Stack.Screen name="cities/unvisited" options={{ title: "未打卡城市" }} />
              <Stack.Screen name="city/[city]/manage" options={{ title: "管理城市旅行册" }} />
              <Stack.Screen name="city-map/index" options={{ headerShown: false, presentation: "fullScreenModal" }} />
              <Stack.Screen name="city-map/[city]" options={{ headerShown: false, presentation: "fullScreenModal" }} />
              <Stack.Screen name="recycle-bin" options={{ headerShown: false }} />
              <Stack.Screen name="feedback/index" options={{ title: "意见反馈" }} />
              <Stack.Screen name="settings/index" options={{ title: "设置" }} />
              <Stack.Screen name="privacy/index" options={{ title: "数据与隐私" }} />
              </Stack>
            </PageCaptureProvider>
            </MemoriesProvider>
          </ProfileProvider>
          </AuthProvider>
        </SQLiteProvider>
        </FontLoadingProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function configureDefaultTypography() {
  const defaultTextProps = (Text as unknown as { defaultProps?: { style?: unknown; allowFontScaling?: boolean } });
  defaultTextProps.defaultProps = {
    ...defaultTextProps.defaultProps,
    allowFontScaling: defaultTextProps.defaultProps?.allowFontScaling ?? true,
    style: defaultTextProps.defaultProps?.style,
  };

  const defaultInputProps = (TextInput as unknown as { defaultProps?: { style?: unknown; allowFontScaling?: boolean } });
  defaultInputProps.defaultProps = {
    ...defaultInputProps.defaultProps,
    allowFontScaling: defaultInputProps.defaultProps?.allowFontScaling ?? true,
    style: defaultInputProps.defaultProps?.style,
  };
}

