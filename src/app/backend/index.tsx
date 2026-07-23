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

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
        这是后端接口实验页。旅行册仍然只保存在本机 SQLite；不会自动同步，也不会上传照片。
      </Text>
      <Section title="连接状态">
        <Text selectable style={{ color: colors.ink, fontSize: 18, fontWeight: "800" }}>{status}</Text>
        <AppButton disabled={isChecking} label={isChecking ? "检查中…" : "检查后端连接"} onPress={() => void checkBackend()} />
      </Section>
    </ScrollView>
  );
}
