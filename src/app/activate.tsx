import { Platform, Text, View } from "react-native";

import { PaperCard, ScreenTitle, colors } from "../components/ui";
import { DeveloperNfcConsole } from "../features/gifts/developer-nfc-console";

export function ActivateScreen({ platform = Platform.OS }: { platform?: "ios" | "android" | "web" | "macos" | "windows" }) {
  if (platform === "web") {
    return <View style={{ backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: 20 }}><PaperCard tone="paper" style={{ gap: 12 }}><ScreenTitle title="Open this NFC card in the One Tap Reality app" caption="APP REQUIRED" /><Text selectable style={{ color: colors.muted, lineHeight: 22 }}>Card preparation and activation require the native app. Install or open One Tap Reality, then tap this card again.</Text></PaperCard></View>;
  }
  return <DeveloperNfcConsole />;
}

export default function ActivateRoute() {
  return <ActivateScreen />;
}
