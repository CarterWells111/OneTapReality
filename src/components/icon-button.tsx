import { Pressable, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";

import { colors } from "./ui";

export type IconName = "edit" | "refresh" | "trash";

/** Material 风格 24×24 图标 path，随应用打包，不依赖图标库。 */
const iconPaths: Record<IconName, string> = {
  edit:
    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  refresh:
    "M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  trash:
    "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  tone = "default",
}: {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const fill = tone === "danger" ? colors.danger : colors.ink;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Svg height={20} viewBox="0 0 24 24" width={20}>
        <Path d={iconPaths[icon]} fill={fill} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
