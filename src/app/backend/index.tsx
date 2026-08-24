import * as React from "react";
import { ScrollView, Text } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { BackendApiClient } from "../../services/backend/api-client";

const client = new BackendApiClient();

export default function BackendExperimentScreen() {
  const [status, setStatus] = React.useState("尚未连接后端");
  const [isChecking, setIsChecking] = React.useState(false);

  const checkBackend = async () => {
    setIsChecking(true);
    try {
      const [health, capabilities] = await Promise.all([client.getHealth(), client.getCapabilities()]);
      setStatus(health.database === "ok" && !capabilities.features.automaticSync ? "后端连接正常" : "后端能力异常");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "后端连接失败");
    } finally {
      setIsChecking(false);
    }
  };

  // This is a developer experiment screen; keep the code but do not expose it in production builds.
  if (!__DEV__) return null;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
        可在此检查后端服务连接状态与能力。
      </Text>
      <Section title="连接状态">
        <Text selectable style={{ color: colors.ink, fontSize: 18, fontWeight: "800" }}>{status}</Text>
        <AppButton disabled={isChecking} label={isChecking ? "检查中…" : "检查后端连接"} onPress={() => void checkBackend()} />
      </Section>
    </ScrollView>
  );
}
