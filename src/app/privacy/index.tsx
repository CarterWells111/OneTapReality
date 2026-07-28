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
        <Text selectable style={styles.helper}>本地旅行册默认留在设备；发布 NFC 礼品前会明确说明共享范围。</Text>
      </View>

      <Section title="数据存储说明">
        <PrivacyCard title="本地旅行册">
          本地旅行册默认保存在设备 SQLite 中；旅行信息、照片 URI 和版式不会自动上传。
        </PrivacyCard>
      </Section>

      <Section title="账户与 NFC 礼品共享">
        <PrivacyCard title="只在明确发布时上传">
          你可以使用邮箱验证码登录。只有明确发布 NFC 礼品时，礼品访问邮箱、共享快照和所选照片才会上传到私有云端存储，供已授权的礼品成员查看。
        </PrivacyCard>
      </Section>

      <Section title="内容生成说明">
        <PrivacyCard title="不识别图像内容">
          内容生成基于你填写的标题、城市、日期、照片数量和顺序，不识别图像中的人物或具体内容。
        </PrivacyCard>
      </Section>

      <Section title="礼品停用与删除">
        <PrivacyCard title="本地与共享数据分开管理">
          本地删除不会停用已发布的礼品。礼品管理者可在礼品管理页面停用礼品；停用会删除该礼品的共享快照和媒体。
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
