import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { AppButton, colors } from "../../../components/ui";
import { BookCanvasEditor } from "../../../features/canvas/book-canvas-editor";
import { canvasPages } from "../../../features/canvas/editor-pages";
import { useMemories } from "../../../features/memories/memories-provider";
import type { Memory, StoryPage } from "../../../types/memory";

export default function EditMemoryScreen() {
  const router = useRouter();
  const { id, pageId, pageIndex } = useLocalSearchParams<{
    id: string;
    pageId?: string | string[];
    pageIndex?: string | string[];
  }>();
  const { getDraftById, getMemoryById, persistSelectedPhoto, updatePages } = useMemories();
  const savedMemory = getMemoryById(id);
  const [loadedDraft, setLoadedDraft] = React.useState<Memory | null>(null);
  const memory = savedMemory ?? loadedDraft ?? undefined;
  const [pages, setPages] = React.useState<StoryPage[]>([]);
  const [activePage, setActivePage] = React.useState<{ pageId: string; index: number } | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isTransformPending, setIsTransformPending] = React.useState(false);

  React.useEffect(() => {
    if (savedMemory) {
      return;
    }
    let isMounted = true;
    void getDraftById(id)
      .then((draft) => {
        if (isMounted) {
          setLoadedDraft(draft);
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [getDraftById, id, savedMemory]);

  React.useEffect(() => {
    if (memory) {
      setPages(canvasPages(memory.pages));
    }
  }, [memory]);

  if (!memory || pages.length === 0) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text selectable style={styles.muted}>正在读取可编辑的旅行册…</Text>
      </ScrollView>
    );
  }

  const save = async () => {
    setIsSaving(true);
    try {
      await updatePages(memory, canvasPages(pages));
      const fallbackIndex = parseFallbackIndex(pageIndex);
      const fallbackPage = pages[fallbackIndex] ?? pages[0];
      const cursor = activePage ?? { pageId: fallbackPage.id, index: fallbackIndex };
      router.dismissTo({
        pathname: "/memory/[id]",
        params: { id: memory.id, pageId: cursor.pageId, pageIndex: String(cursor.index) },
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text selectable style={styles.muted}>
        双击组件进入编辑；未选中时横滑书页可翻页。这里仍采用显式保存，点击下方按钮前不会写入旅行册。
      </Text>
      <BookCanvasEditor
        fallbackIndex={parseFallbackIndex(pageIndex)}
        initialPageId={typeof pageId === "string" ? pageId : undefined}
        onActivePageChange={setActivePage}
        onPagesChange={(nextPages) => setPages(nextPages)}
        onTransformPendingChange={setIsTransformPending}
        pages={pages}
        persistSelectedPhoto={(uri) => persistSelectedPhoto(memory.id, uri)}
      />
      <AppButton
        disabled={isSaving || isTransformPending}
        label={isSaving ? "正在保存…" : "保存画布"}
        onPress={() => void save()}
      />
    </ScrollView>
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
  content: { gap: 16, paddingBottom: 28, paddingTop: 14 },
  muted: { color: colors.muted, lineHeight: 22, paddingHorizontal: 20 },
});
