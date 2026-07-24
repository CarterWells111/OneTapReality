import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconButton } from "../../components/icon-button";
import { AppButton, colors, serifFont, Tag } from "../../components/ui";
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
        <View style={[styles.cover, { backgroundColor: memory.coverColor ?? city.color }]}>
          <View style={styles.coverTop}>
            <Tag label={isSample ? "示例 · 扉页" : "扉页"} />
            <Text selectable style={styles.coverTitle}>{memory.title}</Text>
            <View style={styles.coverAccent} />
          </View>
          <View>
            <Text selectable style={styles.coverMeta}>{city.name} · {memory.travelDate}</Text>
            <Text selectable style={styles.coverMeta}>
              {isSample ? "杭州 · 示例" : `${memory.photoUris.length} 张照片`}
            </Text>
          </View>
        </View>
        <Text selectable style={styles.readerLead}>轻轻左右滑动，一页页翻阅这一册。</Text>
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
  cover: {
    aspectRatio: 1,
    borderColor: colors.paperEdge,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: "space-between",
    padding: 24,
  },
  coverTop: { alignItems: "flex-start", gap: 12 },
  coverTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 30, fontWeight: "800", lineHeight: 38 },
  coverAccent: { backgroundColor: colors.warmAccent, height: 3, width: 40 },
  coverMeta: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  readerLead: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
});
