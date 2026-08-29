import { Stack } from "expo-router";

import { colors, serifFont } from "../../components/ui";
import { AccountRouteGate } from "../../features/auth/account-route-gate";

export default function MemoryRoutesLayout() {
  return (
    <AccountRouteGate>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: serifFont },
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="new" options={{ title: "创建纪念册" }} />
        <Stack.Screen name="review/[id]" options={{ title: "确认草稿" }} />
        <Stack.Screen name="[id]" options={{ title: "旅行册" }} />
        <Stack.Screen name="[id]/edit" options={{ title: "编辑旅行册" }} />
      </Stack>
    </AccountRouteGate>
  );
}
