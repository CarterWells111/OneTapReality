import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

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
import {
  MIN_TRAVEL_DATE,
  parseIsoTravelDate,
  toIsoTravelDate,
} from "../../../features/memories/travel-date";
import type { Memory, StoryPage } from "../../../types/memory";

type Action = "save" | "retry" | "discard" | null;

export default function DraftReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    discardDraft,
    getDraftById,
    persistSelectedPhoto,
    stageSelectedPhoto,
    retryDraft,
    saveDraft,
    updateDraftPages,
  } = useMemories();
  const [draft, setDraft] = React.useState<Memory | null>(null);
  const draftRef = React.useRef<Memory | null>(null);
  const queueRef = React.useRef<AutosaveQueue<Memory> | null>(null);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const pendingDebouncedDraft = React.useRef<Memory | null>(null);
  const textTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autosaveState, setAutosaveState] = React.useState<AutosaveQueueState>({ status: "saved" });
  const [isLoading, setIsLoading] = React.useState(true);
  const [action, setAction] = React.useState<Action>(null);
  const [editorChangePending, setEditorChangePending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showDatePicker, setShowDatePicker] = React.useState(false);
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
    const queue = new AutosaveQueue<Memory>(async (snapshot) => {
      if (!snapshot.title.trim()) {
        throw new Error("请输入纪念册标题");
      }
      await updateDraftPages(snapshot, snapshot.pages);
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
    const pendingDraft = pendingDebouncedDraft.current;
    pendingDebouncedDraft.current = null;
    textTimer.current = null;
    if (pendingDraft?.title.trim()) {
      queueRef.current?.enqueue(pendingDraft);
    }
  }, []);

  const enqueueDraft = React.useCallback((snapshot: Memory) => {
    if (!snapshot.title.trim()) {
      setError("请输入纪念册标题");
      return;
    }
    queueRef.current?.enqueue(snapshot);
  }, []);

  const enqueuePendingDraft = React.useCallback(() => {
    if (!pendingDebouncedDraft.current) {
      return;
    }
    const snapshot = pendingDebouncedDraft.current;
    pendingDebouncedDraft.current = null;
    textTimer.current = null;
    enqueueDraft(snapshot);
  }, [enqueueDraft]);

  const clearTextDebounce = React.useCallback(() => {
    if (textTimer.current) {
      clearTimeout(textTimer.current);
      textTimer.current = null;
    }
    pendingDebouncedDraft.current = null;
  }, []);

  const changePages = (pages: StoryPage[], reason: BookEditorChangeReason) => {
    const currentDraft = draftRef.current;
    if (!currentDraft) {
      return false;
    }
    const nextDraft = { ...currentDraft, pages };
    draftRef.current = nextDraft;
    setDraft(nextDraft);

    if (reason === "text") {
      pendingDebouncedDraft.current = nextDraft;
      if (textTimer.current) {
        clearTimeout(textTimer.current);
      }
      textTimer.current = setTimeout(enqueuePendingDraft, 400);
      return true;
    }

    clearTextDebounce();
    enqueueDraft(nextDraft);
    return true;
  };

  const changeTitle = (title: string) => {
    const currentDraft = draftRef.current;
    if (!currentDraft) {
      return;
    }
    const nextDraft = { ...currentDraft, title };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    if (title.trim()) {
      setError((current) => current === "请输入纪念册标题" ? "" : current);
    }
    pendingDebouncedDraft.current = nextDraft;
    if (textTimer.current) {
      clearTimeout(textTimer.current);
    }
    textTimer.current = setTimeout(enqueuePendingDraft, 400);
  };

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
    const currentDraft = draftRef.current;
    if (event.type !== "set" || !selected || !currentDraft) {
      return;
    }
    const nextDraft = { ...currentDraft, travelDate: toIsoTravelDate(selected) };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    clearTextDebounce();
    enqueueDraft(nextDraft);
  };

  const flushAutosave = async () => {
    if (pendingDebouncedDraft.current) {
      if (textTimer.current) {
        clearTimeout(textTimer.current);
      }
      enqueuePendingDraft();
    }
    await queueRef.current?.waitForIdle();
  };

  const keepDraft = async () => {
    if (editorChangePending) return;
    if (!draftRef.current?.title.trim()) {
      setError("请输入纪念册标题");
      return;
    }
    setAction("save");
    setError("");
    try {
      await flushAutosave();
      await saveDraft(id);
      router.replace({ pathname: "/memory/[id]", params: { id } });
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
    if (editorChangePending) return;
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
    if (editorChangePending) return;
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
    if (editorChangePending) return;
    Alert.alert("丢弃草稿", "丢弃后不会保存为旅行记忆。", [
      { text: "取消", style: "cancel" },
      { text: "丢弃", style: "destructive", onPress: () => void discard() },
    ]);
  };

  const isActing = action !== null || editorChangePending;
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
              <TextInput
                accessibilityLabel="纪念册标题"
                editable={!isActing}
                onChangeText={changeTitle}
                placeholder="纪念册标题"
                placeholderTextColor={colors.muted}
                style={styles.title}
                value={draft.title}
              />
              <View style={styles.metadataRow}>
                <Text selectable style={styles.metadata}>{city.name} ·</Text>
                <Pressable
                  accessibilityLabel="选择旅行日期"
                  accessibilityRole="button"
                  disabled={isActing}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text selectable style={styles.dateValue}>{draft.travelDate} ›</Text>
                </Pressable>
              </View>
            </View>
            <Text selectable style={styles.pageCount}>{draft.pages.length} 页</Text>
          </View>

          <Text selectable style={styles.hint}>
            横滑翻页；双击组件后可拖动、缩放或旋转。
          </Text>

          <BookCanvasEditor
            onPagesChange={changePages}
            onTransformPendingChange={setEditorChangePending}
            pages={draft.pages}
            persistSelectedPhoto={(uri) => persistSelectedPhoto(draft.id, uri)}
            stageSelectedPhoto={(uri) => stageSelectedPhoto(draft.id, uri)}
          />

          <AutosaveStatus
            onRetry={() => queueRef.current?.retry()}
            state={autosaveState}
          />
          <Text selectable style={styles.aiDisclaimer}>
            本地规则生成的可编辑初稿，不分析照片内容
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

        {showDatePicker && Platform.OS === "android" ? (
          <DateTimePicker
            maximumDate={new Date()}
            minimumDate={MIN_TRAVEL_DATE}
            mode="date"
            onChange={handleDateChange}
            value={parseIsoTravelDate(draft.travelDate)}
          />
        ) : null}

        {showDatePicker && Platform.OS === "ios" ? (
          <View style={styles.overlay}>
            <View style={styles.dateSheet}>
              <Text selectable style={styles.sheetTitle}>选择旅行日期</Text>
              <DateTimePicker
                display="spinner"
                maximumDate={new Date()}
                minimumDate={MIN_TRAVEL_DATE}
                mode="date"
                onChange={handleDateChange}
                textColor={colors.ink}
                themeVariant="light"
                value={parseIsoTravelDate(draft.travelDate)}
              />
              <AppButton label="完成" onPress={() => setShowDatePicker(false)} />
            </View>
          </View>
        ) : null}
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
  title: { color: colors.ink, fontSize: 20, fontWeight: "800", margin: 0, padding: 0 },
  metadataRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  metadata: { color: colors.muted, fontSize: 13 },
  dateValue: { color: colors.accent, fontSize: 13, fontWeight: "700" },
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(38, 49, 62, 0.35)", justifyContent: "flex-end" },
  dateSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 12,
    padding: 20,
  },
  sheetTitle: { color: colors.ink, fontSize: 19, fontWeight: "800" },
});
