import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

export const colors = {
  background: "#F7F3EE",
  surface: "#FFFFFF",
  ink: "#24312B",
  muted: "#69756E",
  line: "#E8E1D8",
  accent: "#2F6F5E",
  accentSoft: "#E4F0EA",
  danger: "#A33A33",
} as const;

export function AppButton({
  label,
  onPress,
  disabled = false,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}) {
  const backgroundColor =
    tone === "primary"
      ? colors.accent
      : tone === "danger"
        ? "#F8E4E2"
        : colors.accentSoft;
  const textColor =
    tone === "primary" ? "#FFFFFF" : tone === "danger" ? colors.danger : colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor,
        borderRadius: 14,
        minHeight: 48,
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        paddingHorizontal: 18,
      })}
    >
      <Text selectable style={{ color: textColor, fontSize: 16, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text selectable style={{ color: colors.ink, fontSize: 19, fontWeight: "700" }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

