import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { useMemories } from "../../features/memories/memories-provider";

export default function PrivacyScreen() {
  const { clearAllMemories } = useMemories();

  const confirmClear = () => {
    Alert.alert("删除所有本地记忆？", "这会删除这台设备上的旅行册、照片引用和草稿，操作不可恢复。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => void clearAllMemories() },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text selectable style={styles.eyebrow}>本机优先</Text>
        <Text selectable style={styles.title}>本机数据与隐私声明</Text>
        <Text selectable style={styles.helper}>这是一款本地优先演示应用，不使用账户或自动云同步。你可以在设置中主动打开后端实验页检查接口，但不会上传旅行册或照片。</Text>
      </View>

      <Section title="数据只留在设备上">
        <PrivacyCard title="本机 SQLite 存储">
          旅行信息、照片 URI 和旅行册内容仅保存在本机 SQLite 中；照片不会上传或共享。
        </PrivacyCard>
      </Section>

      <Section title="可选后端实验">
        <PrivacyCard title="只在主动点击时请求">
          后端实验页只检查服务健康状态和能力，不上传旅行信息、照片 URI、照片二进制或本地文件路径。断网不会影响本地旅行册。
        </PrivacyCard>
      </Section>

      <Section title="演示生成器说明">
        <PrivacyCard title="不识别图像内容">
          DemoDraftGenerator 不识别人或地点，也不会上传照片。它只使用你填写的标题、城市、日期、照片数量和本地照片顺序生成固定草稿。
        </PrivacyCard>
      </Section>

      <Section title="NFC 体验状态">
        <PrivacyCard title="Expo Go 模拟模式">
          Expo Go 仅模拟 NFC；当前体验不会读取真实 NFC 标签。
        </PrivacyCard>
      </Section>

      <Section title="数据管理">
        <PrivacyCard title="删除不可恢复">删除后会移除这台设备上的旅行册、照片引用和草稿。</PrivacyCard>
        <AppButton label="删除所有本地数据" onPress={confirmClear} tone="danger" />
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
