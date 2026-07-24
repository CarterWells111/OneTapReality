import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { useMemories } from "../../features/memories/memories-provider";

export default function PrivacyScreen() {
  const { clearAllMemories } = useMemories();

  const confirmClear = () => {
    Alert.alert("删除所有记忆？", "这会删除旅行册、照片引用和草稿，操作不可恢复。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => void clearAllMemories() },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text selectable style={styles.eyebrow}>隐私优先</Text>
        <Text selectable style={styles.title}>数据与隐私声明</Text>
        <Text selectable style={styles.helper}>不使用账户或自动云同步，你的数据始终由你掌控。</Text>
      </View>

      <Section title="数据存储说明">
        <PrivacyCard title="SQLite 存储">
          旅行信息、照片 URI 和旅行册内容保存在设备 SQLite 中；照片不会上传或共享。
        </PrivacyCard>
      </Section>

      <Section title="可选后端连接">
        <PrivacyCard title="只在主动点击时请求">
          后端页只检查服务健康状态和能力，不上传旅行信息、照片 URI、照片二进制或文件路径。断网不影响旅行册的使用。
        </PrivacyCard>
      </Section>

      <Section title="内容生成说明">
        <PrivacyCard title="不识别图像内容">
          内容生成基于你填写的标题、城市、日期、照片数量和顺序，不识别图像中的人物或具体内容。
        </PrivacyCard>
      </Section>

      <Section title="NFC 体验">
        <PrivacyCard title="当前状态">
          当前通过按钮读取城市钥匙，体验城市收藏功能。
        </PrivacyCard>
      </Section>

      <Section title="数据管理">
        <PrivacyCard title="删除不可恢复">删除后旅行册、照片引用和草稿将被移除。</PrivacyCard>
        <AppButton label="删除所有数据" onPress={confirmClear} tone="danger" />
      </Section>
    </ScrollView>
  );
}

function PrivacyCard({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.card}>
      <Text selectable style={styles.cardTitle}>{title}</Text>
      <Text selectable style={styles.helper}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, padding: 20 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 22, gap: 8, padding: 20 },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  helper: { color: colors.muted, lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
});
