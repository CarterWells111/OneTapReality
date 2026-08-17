import { Stack } from "expo-router";

import { colors, serifFont } from "../../components/ui";
import { AccountRouteGate } from "../../features/auth/account-route-gate";

export default function RecycleBinRoutesLayout() {
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
        <Stack.Screen name="index" options={{ title: "回收站" }} />
      </Stack>
    </AccountRouteGate>
  );
}
