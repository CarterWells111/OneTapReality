import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, ScrollView, Text, View } from "react-native";

import { AppButton, colors } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { CanvasPage } from "../../features/canvas/canvas-page";
import { useMemories } from "../../features/memories/memories-provider";
import { sampleMemory } from "../../features/memories/sample-memory";

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

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 20 }}>
      <View style={{ backgroundColor: city.color, borderRadius: 22, gap: 8, padding: 22 }}>
        <Text selectable style={{ color: colors.ink, fontSize: 28, fontWeight: "800" }}>{memory.title}</Text>
        <Text selectable style={{ color: colors.muted }}>{city.name} · {memory.travelDate}</Text>
        <Text selectable style={{ color: colors.muted }}>{isSample ? "杭州示例旅行册" : `${memory.photoUris.length} 张本地照片`}</Text>
      </View>
      {memory.pages.map((page) => (
        <View key={page.id} style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 8, padding: 18 }}>
          <Text selectable style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>
            {page.position + 1} / {memory.pages.length}
          </Text>
          {page.layout ? (
            <CanvasPage interactive={false} layout={page.layout} />
          ) : (
            <>
              <Text selectable style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>{page.headline}</Text>
              <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{page.body}</Text>
            </>
          )}
        </View>
      ))}
      {isSample ? (
        <AppButton label="用自己的照片创建" onPress={() => router.push("/memory/new")} />
      ) : (
        <>
          <AppButton label="编辑旅行册" onPress={() => router.push({ pathname: "/memory/[id]/edit", params: { id: memory.id } })} />
          <AppButton label="删除这册旅行记忆" tone="danger" onPress={confirmDelete} />
        </>
      )}
    </ScrollView>
  );
}

