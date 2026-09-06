import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { AppButton, colors, PaperCard } from "../../components/ui";
import { getBuildEnvironment } from "../../config/build-environment";
import { parseGiftLink } from "../../services/nfc/gift-link-parser";

export function DevelopmentGiftLinkEntry() {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const openGift = () => {
    try {
      const environment = getBuildEnvironment();
      const parsed = parseGiftLink(value, environment.giftUrlOrigin);
      setError(null);
      router.push(parsed.pathname as never);
    } catch {
      setError("链接不是当前 STAGING 环境的有效礼品链接。");
    }
  };

  return (
    <PaperCard tone="paper" style={styles.card}>
      <Text selectable style={styles.title}>Development · STAGING 礼品测试</Text>
      <Text selectable style={styles.help}>
        粘贴 staging HTTPS 礼品链接。此入口不会绕过登录、成员权限、礼品状态或服务端校验。
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(nextValue) => {
          setValue(nextValue);
          setError(null);
        }}
        placeholder="https://staging.onetapreality.com/gift/…"
        style={styles.input}
        value={value}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <AppButton label="打开 staging 礼品" tone="warm" onPress={openGift} />
    </PaperCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  help: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  input: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
