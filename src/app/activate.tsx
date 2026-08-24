import { Text, View } from "react-native";

import { PaperCard, ScreenTitle, colors } from "../components/ui";

export function ActivateScreen({ platform: _platform }: { platform?: "ios" | "android" | "web" | "macos" | "windows" }) {
  return (
    <View style={{ backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: 20 }}>
      <PaperCard tone="paper" style={{ gap: 12 }}>
        <ScreenTitle title="礼品尚未准备好，请联系赠送者" caption="ONETAPREALITY" />
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          如需帮助，请联系 support@onetapreality.com
        </Text>
      </PaperCard>
    </View>
  );
}

export default function ActivateRoute() {
  return <ActivateScreen />;
}
