import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconButton } from "../../components/icon-button";
import { AppButton, colors } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { CanvasPage } from "../../features/canvas/canvas-page";
import { useMemories } from "../../features/memories/memories-provider";
import { sampleMemory } from "../../features/memories/sample-memory";

const serifFont = Platform.select({ android: "serif", default: "Georgia" });

export default function MemoryDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { deleteMemory, getMemoryById } = useMemories();
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
    Alert.alert("删除这册旅行记忆？", "删除后无法恢复。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          void deleteMemory(memory.id).then(() => router.replace("/"));
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
        <View style={[styles.cover, { backgroundColor: city.color }]}>
          <View style={styles.coverTop}>
            <Text selectable style={styles.coverTitle}>{memory.title}</Text>
            <View style={styles.coverAccent} />
          </View>
          <View>
            <Text selectable style={styles.coverMeta}>{city.name} · {memory.travelDate}</Text>
            <Text selectable style={styles.coverMeta}>
              {isSample ? "杭州示例旅行册" : `${memory.photoUris.length} 张本地照片`}
            </Text>
          </View>
        </View>
        {memory.pages.map((page) => (
          <View key={page.id} style={styles.pageCard}>
            <Text selectable style={styles.pageNumber}>
              {page.position + 1} / {memory.pages.length}
            </Text>
            {page.layout ? (
              <CanvasPage
                displayAspectRatio={3 / 4}
                interactive={false}
                layout={page.layout}
                pageSide={page.position % 2 === 0 ? "right" : "left"}
              />
            ) : (
              <>
                <Text selectable style={styles.pageHeadline}>{page.headline}</Text>
                <Text selectable style={styles.pageBody}>{page.body}</Text>
              </>
            )}
          </View>
        ))}
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
    borderRadius: 22,
    justifyContent: "space-between",
    padding: 24,
  },
  coverTop: { gap: 12 },
  coverTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 30, fontWeight: "800", lineHeight: 38 },
  coverAccent: { backgroundColor: colors.warmAccent, height: 3, width: 40 },
  coverMeta: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  pageCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  pageNumber: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  pageHeadline: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  pageBody: { color: colors.muted, lineHeight: 22 },
});
