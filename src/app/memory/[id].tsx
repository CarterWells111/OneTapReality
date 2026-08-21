import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { IconButton } from "../../components/icon-button";
import { AppButton, colors, Tag } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { PageReader } from "../../features/canvas/page-reader";
import { PageManagerSheet } from "../../features/canvas/page-manager-sheet";
import { useMemories } from "../../features/memories/memories-provider";
import { sampleMemory } from "../../features/memories/sample-memory";
import { showShareActionSheet } from "../../features/export/share-action-sheet";

export default function MemoryDetailScreen() {
  const router = useRouter();
  const { id, pageId, pageIndex } = useLocalSearchParams<{
    id: string;
    pageId?: string | string[];
    pageIndex?: string | string[];
  }>();
  const { discardMemory, getMemoryById } = useMemories();
  const isSample = id === sampleMemory.id;
  const memory = isSample ? sampleMemory : getMemoryById(id);
  const [activePage, setActivePage] = React.useState<{ pageId: string; index: number } | null>(null);
  const [isPagePreviewOpen, setIsPagePreviewOpen] = React.useState(false);
  const [previewCursor, setPreviewCursor] = React.useState<{
    index: number;
    memoryId: string;
    pageId: string;
  } | null>(null);
  const [previewRestorationKey, setPreviewRestorationKey] = React.useState(0);

  React.useEffect(() => {
    setActivePage(null);
    setIsPagePreviewOpen(false);
    setPreviewCursor(null);
    setPreviewRestorationKey(0);
  }, [id]);

  if (!memory) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20 }}>
        <Text selectable style={{ color: colors.muted }}>正在读取旅行册…</Text>
      </ScrollView>
    );
  }

  const city = cityContent[memory.city];
  const fallbackIndex = parseFallbackIndex(pageIndex);
  const fallbackPage = memory.pages[fallbackIndex] ?? memory.pages[0];
  const restoredPreviewCursor = previewCursor?.memoryId === memory.id ? previewCursor : null;
  const openEditor = () => {
    const cursor = activePage ?? { pageId: fallbackPage?.id ?? "", index: fallbackIndex };
    router.push({
      pathname: "/memory/[id]/edit",
      params: { id: memory.id, pageId: cursor.pageId, pageIndex: String(cursor.index) },
    });
  };
  const confirmDelete = () => {
    Alert.alert("删除这册旅行记忆？", "会移入回收站，可在回收站里恢复或彻底删除。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          void discardMemory(memory.id)
            .then(() => router.replace("/"))
            .catch(() => {
              Alert.alert("删除失败", "未能移入回收站，请稍后重试。");
            });
        },
      },
    ]);
  };

  const headerRight = isSample
    ? undefined
    : () => (
        <View style={styles.headerActions}>
          <ShareButton onPress={() => showShareActionSheet({ coverImage: memory.coverImage, pages: memory.pages, photoUris: memory.photoUris, title: memory.title })} />
          <IconButton
            accessibilityLabel="编辑旅行册"
            icon="edit"
            onPress={openEditor}
          />
        </View>
      );

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryTitle}>
            <Tag label={isSample ? "示例 · 扉页" : "扉页"} />
            <Text selectable style={styles.summaryMemoryTitle}>{memory.title}</Text>
          </View>
          <Text selectable style={styles.summaryMeta}>{city.name} · {memory.travelDate}</Text>
        </View>
        <Text selectable style={styles.readerLead}>轻轻左右滑动，一页页翻阅这一册。扉页为第一页。</Text>
        <PageReader
          fallbackIndex={restoredPreviewCursor?.index ?? fallbackIndex}
          initialPageId={restoredPreviewCursor?.pageId ?? (typeof pageId === "string" ? pageId : undefined)}
          onActivePageChange={setActivePage}
          pages={memory.pages}
          restorationKey={`${memory.id}:${restoredPreviewCursor ? previewRestorationKey : 0}`}
        />
        <View style={styles.localActions} testID="memory-detail-actions">
          <AppButton label="页面预览" onPress={() => setIsPagePreviewOpen(true)} />
          {isSample ? (
            <AppButton label="用自己的照片创建" onPress={() => router.push("/memory/new")} />
          ) : (
            <AppButton label="绑定到礼品" tone="warm" onPress={() => router.push(`/gifts?memoryId=${encodeURIComponent(memory.id)}` as never)} />
          )}
        </View>
      </ScrollView>
      {isPagePreviewOpen ? (
        <PageManagerSheet
          mode="preview"
          onClose={() => setIsPagePreviewOpen(false)}
          {...(!isSample ? { onDeleteAlbum: confirmDelete } : {})}
          onJumpToPage={(index) => {
            const target = memory.pages[index];
            if (target) {
              setPreviewCursor({ index, memoryId: memory.id, pageId: target.id });
              setPreviewRestorationKey((current) => current + 1);
            }
          }}
          pages={memory.pages}
        />
      ) : null}
    </>
  );
}

function parseFallbackIndex(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 20 },
  headerActions: { flexDirection: "row", gap: 2 },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  summaryTitle: { alignItems: "center", flex: 1, flexDirection: "row", gap: 8 },
  summaryMemoryTitle: { color: colors.ink, flexShrink: 1, fontSize: 17, fontWeight: "800" },
  summaryMeta: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  readerLead: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
  localActions: { gap: 10 },
});

/** Apple 风格分享按钮（方框+箭头），用于 header。 */
function ShareButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="分享这册旅行记忆"
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        shareStyles.button,
        pressed && shareStyles.pressed,
      ]}
    >
      <Svg height={20} viewBox="0 0 24 24" width={20}>
        <Path
          d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
          fill={colors.ink}
        />
      </Svg>
    </Pressable>
  );
}

const shareStyles = StyleSheet.create({
  button: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
  pressed: { opacity: 0.6 },
});
