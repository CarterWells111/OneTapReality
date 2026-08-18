import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "./ui";

export function LocalMissingPhotoPlaceholder({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View
      accessible
      accessibilityLabel="本地照片缺失"
      accessibilityRole="image"
      style={[styles.placeholder, style]}
      testID={testID}>
      <Text style={styles.glyph}>🖼</Text>
      <Text style={styles.label}>照片缺失</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: "center", backgroundColor: colors.accentSoft, justifyContent: "center" },
  glyph: { fontSize: 24 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "700", marginTop: 4 },
});
