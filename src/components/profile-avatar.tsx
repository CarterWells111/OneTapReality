import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "./ui";

type ProfileAvatarProps = {
  nickname: string;
  avatarUri: string | null;
  size?: number;
};

export function ProfileAvatar({ nickname, avatarUri, size = 64 }: ProfileAvatarProps) {
  const label = `${nickname}的头像`;
  const avatarStyle = { borderRadius: size / 2, height: size, width: size };

  if (avatarUri) {
    return <Image accessibilityLabel={label} source={{ uri: avatarUri }} style={avatarStyle} />;
  }

  return (
    <View accessibilityLabel={label} accessible style={[styles.fallback, avatarStyle]}>
      <Text selectable style={styles.initial}>{nickname.slice(0, 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    justifyContent: "center",
  },
  initial: { color: colors.accent, fontSize: 24, fontWeight: "800" },
});
