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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getDraftById, getMemoryById, updatePages } = useMemories();
  const savedMemory = getMemoryById(id);
  const [loadedDraft, setLoadedDraft] = React.useState<Memory | null>(null);
  const memory = savedMemory ?? loadedDraft ?? undefined;
  const [pages, setPages] = React.useState<StoryPage[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

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
      router.back();
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
        onPagesChange={(nextPages) => setPages(nextPages)}
        pages={pages}
      />
      <AppButton
        disabled={isSaving}
        label={isSaving ? "正在保存…" : "保存画布"}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 28, paddingTop: 14 },
  muted: { color: colors.muted, lineHeight: 22, paddingHorizontal: 20 },
});
