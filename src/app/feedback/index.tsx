import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as React from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text } from "react-native";

import { AppButton, bodyFont, colors, PaperCard, ScreenTitle } from "../../components/ui";
import {
  openFeedbackEmail,
  type FeedbackEmailContext,
  type OpenFeedbackUrl,
} from "../../features/feedback/feedback-email";

type FeedbackScreenProps = Partial<FeedbackEmailContext> & {
  readonly openUrl?: OpenFeedbackUrl;
};

export function FeedbackScreen({
  appVersion = Constants.expoConfig?.version ?? "未知版本",
  deviceName = Constants.deviceName ?? "iPhone",
  openUrl = Linking.openURL,
  system = `${Platform.OS} ${String(Platform.Version)}`,
}: FeedbackScreenProps) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "opening" | "opened" | "error">("idle");

  const openEmail = async () => {
    if (state === "opening") return;
    setState("opening");
    const didOpen = await openFeedbackEmail({ appVersion, deviceName, system }, openUrl);
    setState(didOpen ? "opened" : "error");
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ScreenTitle title="反馈与支持" caption="BETA FEEDBACK" />

      <PaperCard tone="paper" style={styles.card}>
        <Text selectable style={styles.title}>通过邮件告诉我们</Text>
        <Text selectable style={styles.copy}>support@onetapreality.com</Text>
        <Text selectable style={styles.copy}>
          邮件会预填应用版本和设备环境，不会自动附带旅行册、照片、账号或礼品链接。
        </Text>
        <AppButton
          disabled={state === "opening"}
          label={state === "opening" ? "正在打开邮件应用…" : "打开反馈邮件"}
          onPress={() => void openEmail()}
        />
      </PaperCard>

      <PaperCard style={styles.card}>
        <Text selectable style={styles.title}>也可以从 TestFlight 反馈</Text>
        <Text selectable style={styles.copy}>
          遇到问题时，可以截取屏幕截图，再通过 TestFlight 的“发送 Beta 反馈”附上截图和说明。
        </Text>
      </PaperCard>

      {state === "opened" ? (
        <Text accessibilityLiveRegion="polite" selectable style={styles.status}>
          邮件应用已打开，请检查内容并亲自发送。
        </Text>
      ) : null}
      {state === "error" ? (
        <Text accessibilityRole="alert" selectable style={styles.error}>
          无法打开邮件应用，请直接发送邮件到 support@onetapreality.com。
        </Text>
      ) : null}

      <AppButton label="返回" tone="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

export default function FeedbackRoute() {
  return <FeedbackScreen />;
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 20, paddingBottom: 40 },
  card: { gap: 12 },
  title: { color: colors.ink, fontFamily: bodyFont, fontSize: 17, fontWeight: "800" },
  copy: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22 },
  status: { color: colors.accent, fontFamily: bodyFont, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  error: { color: colors.danger, fontFamily: bodyFont, fontSize: 14, fontWeight: "700", lineHeight: 21 },
});
