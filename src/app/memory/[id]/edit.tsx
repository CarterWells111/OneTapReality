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
  const { getDraftById, getMemoryById, persistSelectedPhoto, updatePages } = useMemories();
  const savedMemory = getMemoryById(id);
  const [loadedDraft, setLoadedDraft] = React.useState<Memory | null>(null);
  const memory = savedMemory ?? loadedDraft ?? undefined;
  const [pages, setPages] = React.useState<StoryPage[]>([]);
  const [activePage, setActivePage] = React.useState<{ pageId: string; index: number } | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isTransformPending, setIsTransformPending] = React.useState(false);
  const isMountedRef = React.useRef(true);
  const saveInFlightRef = React.useRef(false);
  const saveGenerationRef = React.useRef(0);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      saveGenerationRef.current += 1;
    };
  }, []);

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
    if (saveInFlightRef.current) {
      return;
    }
    saveInFlightRef.current = true;
    const generation = ++saveGenerationRef.current;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updatePages(memory, canvasPages(pages));
      if (!isMountedRef.current || generation !== saveGenerationRef.current) {
        return;
      }
      const cursor = activePage ?? { pageId: pages[0].id, index: 0 };
      router.replace({
        pathname: "/memory/[id]",
        params: { id: memory.id, pageId: cursor.pageId, pageIndex: String(cursor.index) },
      });
    } catch {
      if (isMountedRef.current && generation === saveGenerationRef.current) {
        setSaveError("保存失败，请稍后重试。");
      }
    } finally {
      if (generation === saveGenerationRef.current) {
        saveInFlightRef.current = false;
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text selectable style={styles.muted}>
        双击组件进入编辑；未选中时横滑书页可翻页。这里仍采用显式保存，点击下方按钮前不会写入旅行册。
      </Text>
      <BookCanvasEditor
        onActivePageChange={setActivePage}
        onPagesChange={(nextPages) => setPages(nextPages)}
        onTransformPendingChange={setIsTransformPending}
        pages={pages}
        persistSelectedPhoto={(uri) => persistSelectedPhoto(memory.id, uri)}
      />
      {saveError ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" selectable style={styles.error}>
          {saveError}
        </Text>
      ) : null}
      <AppButton
        disabled={isSaving || isTransformPending}
        label={isSaving ? "正在保存…" : "保存画布"}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 28, paddingTop: 14 },
  muted: { color: colors.muted, lineHeight: 22, paddingHorizontal: 20 },
  error: { color: colors.danger, paddingHorizontal: 20 },
});
