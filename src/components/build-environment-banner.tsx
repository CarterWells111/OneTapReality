import { StyleSheet, Text, View } from "react-native";

import { getBuildEnvironment } from "../config/build-environment";

export function BuildEnvironmentBanner() {
  const environment = getBuildEnvironment();
  if (environment.buildType !== "development") return null;

  return (
    <View accessibilityRole="header" style={styles.banner}>
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
