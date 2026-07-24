import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconButton } from "../../components/icon-button";
import { AppButton, colors, Tag } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { PageReader } from "../../features/canvas/page-reader";
import { useMemories } from "../../features/memories/memories-provider";
import { sampleMemory } from "../../features/memories/sample-memory";

export default function MemoryDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { discardMemory, getMemoryById } = useMemories();
  const isSample = id === sampleMemory.id;
  const memory = isSample ? sampleMemory : getMemoryById(id);

  if (!memory) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20 }}>
        <Text selectable style={{ color: colors.muted }}>正在读取旅行册…</Text>
      </ScrollView>
    );
  }

  const city = cityContent[memory.city];
  const confirmDelete = () => {
    Alert.alert("删除这册旅行记忆？", "会移入回收站，可在回收站里恢复或彻底删除。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          void discardMemory(memory.id).then(() => router.replace("/"));
        },
      },
    ]);
  };

  const headerRight = isSample
    ? undefined
    : () => (
        <View style={styles.headerActions}>
          <IconButton
            accessibilityLabel="编辑旅行册"
            icon="edit"
            onPress={() => router.push({ pathname: "/memory/[id]/edit", params: { id: memory.id } })}
          />
          <IconButton
            accessibilityLabel="删除这册旅行记忆"
            icon="trash"
            onPress={confirmDelete}
            tone="danger"
          />
        </View>
      );

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.summaryRow}>
          <Tag label={isSample ? "示例 · 扉页" : "扉页"} />
          <Text selectable style={styles.summaryMeta}>{city.name} · {memory.travelDate}</Text>
        </View>
        <Text selectable style={styles.readerLead}>轻轻左右滑动，一页页翻阅这一册。扉页为第一页。</Text>
        <PageReader pages={memory.pages} />
        {isSample ? (
          <AppButton label="用自己的照片创建" onPress={() => router.push("/memory/new")} />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 20 },
  headerActions: { flexDirection: "row", gap: 2 },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  summaryMeta: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  readerLead: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
});
