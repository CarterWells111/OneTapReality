import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getBuildEnvironment } from "../config/build-environment";

export function BuildEnvironmentBanner() {
  const environment = getBuildEnvironment();
  const insets = useSafeAreaInsets();
  if (environment.buildType !== "development") return null;

  return (
    <View
      accessibilityRole="header"
      style={[styles.banner, { paddingTop: insets.top + 7 }]}
      testID="build-environment-banner"
    >
      <Text selectable style={styles.label}>{environment.buildLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    backgroundColor: "#F4A340",
    borderBottomColor: "#7A3F00",
    borderBottomWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  label: {
    color: "#3B2100",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
});
