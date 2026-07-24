import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconButton } from "../../../components/icon-button";
import { AppButton, colors } from "../../../components/ui";
import {
  BookCanvasEditor,
  type BookEditorChangeReason,
} from "../../../features/canvas/book-canvas-editor";
import { canvasPages } from "../../../features/canvas/editor-pages";
import { cityContent } from "../../../features/cities/city-content";
import {
  AutosaveQueue,
  type AutosaveQueueState,
} from "../../../features/memories/autosave-queue";
import { useMemories } from "../../../features/memories/memories-provider";
import type { Memory, StoryPage } from "../../../types/memory";

type Action = "save" | "retry" | "discard" | null;

export default function DraftReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    discardDraft,
    getDraftById,
    retryDraft,
    saveDraft,
    updateDraftPages,
  } = useMemories();
  const [draft, setDraft] = React.useState<Memory | null>(null);
  const draftRef = React.useRef<Memory | null>(null);
  const queueRef = React.useRef<AutosaveQueue<StoryPage[]> | null>(null);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const pendingTextPages = React.useRef<StoryPage[] | null>(null);
  const textTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autosaveState, setAutosaveState] = React.useState<AutosaveQueueState>({ status: "saved" });
  const [isLoading, setIsLoading] = React.useState(true);
  const [action, setAction] = React.useState<Action>(null);
  const [error, setError] = React.useState("");
  const draftId = draft?.id;

  const installDraft = React.useCallback((nextDraft: Memory) => {
    const preparedDraft = { ...nextDraft, pages: canvasPages(nextDraft.pages) };
    draftRef.current = preparedDraft;
    setDraft(preparedDraft);
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    void getDraftById(id)
      .then((nextDraft) => {
        if (isMounted && nextDraft) {
          installDraft(nextDraft);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("无法读取草稿，请重试。");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [getDraftById, id, installDraft]);

  React.useEffect(() => {
    if (!draftId || queueRef.current) {
      return;
    }
    const queue = new AutosaveQueue<StoryPage[]>(async (pages) => {
      const currentDraft = draftRef.current;
      if (!currentDraft) {
        throw new Error("草稿已不可用");
      }
      await updateDraftPages({ ...currentDraft, pages }, pages);
    });
    queueRef.current = queue;
    unsubscribeRef.current = queue.subscribe(setAutosaveState);

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [draftId, updateDraftPages]);

  React.useEffect(() => () => {
    if (textTimer.current) {
      clearTimeout(textTimer.current);
    }
  }, []);

  const enqueuePendingText = React.useCallback(() => {
    if (!pendingTextPages.current) {
      return;
    }
    const pages = pendingTextPages.current;
    pendingTextPages.current = null;
    textTimer.current = null;
    queueRef.current?.enqueue(pages);
  }, []);

  const clearTextDebounce = React.useCallback(() => {
    if (textTimer.current) {
      clearTimeout(textTimer.current);
      textTimer.current = null;
    }
    pendingTextPages.current = null;
  }, []);

  const changePages = (pages: StoryPage[], reason: BookEditorChangeReason) => {
    const currentDraft = draftRef.current;
    if (!currentDraft) {
      return;
    }
    const nextDraft = { ...currentDraft, pages };
    draftRef.current = nextDraft;
    setDraft(nextDraft);

    if (reason === "text") {
      pendingTextPages.current = pages;
      if (textTimer.current) {
        clearTimeout(textTimer.current);
      }
      textTimer.current = setTimeout(enqueuePendingText, 400);
      return;
    }

    clearTextDebounce();
    queueRef.current?.enqueue(pages);
  };

  const flushAutosave = async () => {
    if (pendingTextPages.current) {
      if (textTimer.current) {
        clearTimeout(textTimer.current);
      }
      enqueuePendingText();
    }
    await queueRef.current?.waitForIdle();
  };

  const keepDraft = async () => {
    setAction("save");
    setError("");
    try {
      await flushAutosave();
      await saveDraft(id);
      router.replace("/");
    } catch {
      setError("仍有内容未能自动保存，请重试后再保留草稿。");
    } finally {
      setAction(null);
    }
  };

  const supersedeAutosave = async () => {
    clearTextDebounce();
    await queueRef.current?.clearAndWait();
  };

  const regenerate = async () => {
    setAction("retry");
    setError("");
    try {
      await supersedeAutosave();
      installDraft(await retryDraft(id));
    } catch {
      setError("暂时无法重新生成草稿，请重试。");
    } finally {
      setAction(null);
    }
  };

  const discard = async () => {
    setAction("discard");
    setError("");
    try {
      await supersedeAutosave();
      await discardDraft(id);
      router.replace("/");
    } catch {
      setError("暂时无法丢弃草稿，请重试。");
    } finally {
      setAction(null);
    }
  };

  const confirmDiscard = () => {
    Alert.alert("丢弃草稿", "丢弃后不会保存为旅行记忆。", [
      { text: "取消", style: "cancel" },
      { text: "丢弃", style: "destructive", onPress: () => void discard() },
    ]);
  };

  const isActing = action !== null;
  const headerRight = draft
    ? () => (
        <View style={styles.headerActions}>
          <IconButton
            accessibilityLabel="重新生成草稿"
            disabled={isActing}
            icon="refresh"
            onPress={() => void regenerate()}
          />
          <IconButton
            accessibilityLabel="丢弃草稿"
            disabled={isActing}
            icon="trash"
            onPress={confirmDiscard}
            tone="danger"
          />
        </View>
      )
    : undefined;

  if (isLoading) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.loading}>
        <Text selectable style={styles.muted}>正在读取草稿…</Text>
      </ScrollView>
    );
  }

  if (!draft) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.missing}>
        <Text selectable style={styles.muted}>这个草稿已不存在或已被处理。</Text>
        <AppButton label="返回记忆" onPress={() => router.replace("/")} />
      </ScrollView>
    );
  }

  const city = cityContent[draft.city];

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      <View style={styles.screen}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.summary}>
            <View style={styles.summaryCopy}>
              <Text numberOfLines={1} selectable style={styles.title}>{draft.title}</Text>
              <Text selectable style={styles.metadata}>{city.name} · {draft.travelDate}</Text>
            </View>
            <Text selectable style={styles.pageCount}>{draft.pages.length} 页</Text>
          </View>

          <Text selectable style={styles.hint}>
            横滑翻页；双击组件后可拖动、缩放或旋转。
          </Text>

          <BookCanvasEditor
            onPagesChange={changePages}
            pages={draft.pages}
          />

          <AutosaveStatus
            onRetry={() => queueRef.current?.retry()}
            state={autosaveState}
          />
          <Text selectable style={styles.aiDisclaimer}>
            AI 辅助生成的内容可能存在偏差，请在保存前校对。
          </Text>
          {error ? <Text selectable style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <AppButton
            disabled={isActing}
            label={action === "save" ? "正在保留…" : "保留草稿"}
            onPress={() => void keepDraft()}
          />
        </View>
      </View>
    </>
  );
}

function AutosaveStatus({
  onRetry,
  state,
}: {
  onRetry: () => void;
  state: AutosaveQueueState;
}) {
  if (state.status === "error") {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.saveStatus}>
        <Text style={styles.saveError}>保存失败·重试</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.saveStatus}>
      <Text style={styles.saved}>{state.status === "saving" ? "保存中" : "已自动保存"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { padding: 20 },
  missing: { gap: 16, padding: 20 },
  content: { gap: 12, paddingBottom: 20, paddingTop: 10 },
  headerActions: { flexDirection: "row", gap: 2 },
  muted: { color: colors.muted },
  summary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  summaryCopy: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  metadata: { color: colors.muted, fontSize: 13 },
  pageCount: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 20 },
  aiDisclaimer: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 20, textAlign: "center" },
  saveStatus: { alignItems: "center", minHeight: 28, justifyContent: "center" },
  saved: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  saveError: { color: colors.danger, fontSize: 13, fontWeight: "800" },
  error: { color: colors.danger, lineHeight: 20, paddingHorizontal: 20, textAlign: "center" },
  footer: {
    backgroundColor: colors.background,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
});
