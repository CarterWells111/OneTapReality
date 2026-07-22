import { Alert, ScrollView, Text, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { useMemories } from "../../features/memories/memories-provider";

export default function ProfileScreen() {
  const { memories, clearAllMemories } = useMemories();

  const confirmClear = () => {
    Alert.alert("删除所有本地记忆？", "这会删除这台设备上的旅行册、照片引用和草稿，操作不可恢复。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => void clearAllMemories() },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 22, padding: 20 }}>
      <Section title="本地与隐私">
        <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 10, padding: 18 }}>
          <Text selectable style={{ color: colors.ink, fontWeight: "700" }}>本版不上传任何照片</Text>
          <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
            旅行信息、照片 URI 和旅行册文案仅保存在本机 SQLite 中。AI 是固定本地演示草稿，不识别人物或地点。
          </Text>
        </View>
      </Section>
      <Section title="NFC 体验状态">
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          Expo Go 仅展示模拟碰一碰。真实 NFC 标签、Universal Link 与 Development Build 将在下一阶段接入。
        </Text>
      </Section>
      <Section title="本地数据">
        <Text selectable style={{ color: colors.muted }}>已保存 {memories.length} 册旅行记忆。</Text>
        <AppButton label="删除所有本地数据" tone="danger" onPress={confirmClear} />
      </Section>
    </ScrollView>
  );
}

