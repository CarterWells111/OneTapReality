import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, colors } from "../../../components/ui";
import { useLocalLibrary } from "../../../features/auth/local-library-provider";
import {
  BookCanvasEditor,
  type BookCanvasEditorHandle,
} from "../../../features/canvas/book-canvas-editor";
import { canvasPages } from "../../../features/canvas/editor-pages";
import { cityContent } from "../../../features/cities/city-content";
import { localDiagnostics } from "../../../features/diagnostics/local-diagnostics";
import {
  type AutosaveQueueState,
} from "../../../features/memories/autosave-queue";
import {
  acquireMemoryEditRecoveryQueue,
  type MemoryEditRecoveryQueueLease,
} from "../../../features/memories/memory-edit-recovery-queue";
import {
  AlbumMetadataEditor,
  type AlbumMetadataValue,
} from "../../../features/memories/album-metadata-editor";
import { useMemories } from "../../../features/memories/memories-provider";
import type { Memory, StoryPage } from "../../../types/memory";

type CompletedFormalSave = {
  cursor: { pageId: string; index: number };
  loadKey: string;
  memoryId: string;
  sessionToken: number;
};

type LoadedFallbackDraft = {
  loadKey: string;
  memory: Memory | null;
};

type MetadataDraft = {
  identity: string;
  title: string;
  travelDate: string;
};

const PREPARE_SAVE_PENDING_MESSAGE = "正在完成编辑，请稍后重试。";

export default function EditMemoryScreen() {
  const router = useRouter();
  const { id, pageId, pageIndex } = useLocalSearchParams<{
    id: string;
    pageId?: string | string[];
    pageIndex?: string | string[];
  }>();
  const { owner: accountKey } = useLocalLibrary();
  const {
    clearMemoryEditDraft,
    getDraftById,
    getMemoryById,
    getMemoryEditDraft,
    persistSelectedPhoto,
    stageSelectedPhoto,
    saveMemoryEditDraft,
    updatePages,
  } = useMemories();
  const savedMemory = getMemoryById(id);
  const fallbackDraftLoadKey = `${accountKey}:${id}`;
  const [loadedDraft, setLoadedDraft] = React.useState<LoadedFallbackDraft | null>(null);
  const loadedDraftMemory = loadedDraft?.loadKey === fallbackDraftLoadKey
    ? loadedDraft.memory
    : null;
  const memory = savedMemory ?? loadedDraftMemory ?? undefined;
  const isSavedMemory = Boolean(savedMemory);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isFormalSaveCompleted, setIsFormalSaveCompleted] = React.useState(false);
  const loadIdentity = `${accountKey}:${id}:${isSavedMemory ? "saved" : "draft"}`;
  const candidateBaseVersion = memory?.updatedAt ?? "pending";
  const loadBaseVersionRef = React.useRef({ identity: loadIdentity, version: candidateBaseVersion });
  if (loadBaseVersionRef.current.identity !== loadIdentity
    || (!isSaving
      && !isFormalSaveCompleted
      && loadBaseVersionRef.current.version !== candidateBaseVersion)) {
    loadBaseVersionRef.current = { identity: loadIdentity, version: candidateBaseVersion };
  }
  const loadKey = `${loadIdentity}:${loadBaseVersionRef.current.version}`;
  const [pages, setPages] = React.useState<StoryPage[]>([]);
  const [activePage, setActivePage] = React.useState<{ pageId: string; index: number } | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isTransformPending, setIsTransformPending] = React.useState(false);
  const [isRecoveryLoading, setIsRecoveryLoading] = React.useState(true);
  const [recoveryReadError, setRecoveryReadError] = React.useState(false);
  const [didRecover, setDidRecover] = React.useState(false);
  const [metadataDraft, setMetadataDraft] = React.useState<MetadataDraft | null>(null);
  const [editorSessionToken, setEditorSessionToken] = React.useState<number | null>(null);
  const [recoveryState, setRecoveryState] = React.useState<AutosaveQueueState>({ status: "saved" });
  const activePageRef = React.useRef(activePage);
  const editorRef = React.useRef<BookCanvasEditorHandle>(null);
  const clearMemoryEditDraftRef = React.useRef(clearMemoryEditDraft);
  const completedFormalSaveRef = React.useRef<CompletedFormalSave | null>(null);
  const getMemoryEditDraftRef = React.useRef(getMemoryEditDraft);
  const initializedLoadKeyRef = React.useRef<string | null>(null);
  const isMountedRef = React.useRef(true);
  const editorCommitLockedRef = React.useRef(false);
  const editorSessionGenerationRef = React.useRef(0);
  const isTransformPendingRef = React.useRef(false);
  const loadGenerationRef = React.useRef(0);
  const memoryRef = React.useRef(memory);
  const metadataDraftRef = React.useRef<MetadataDraft | null>(null);
  const pagesRef = React.useRef(pages);
  const queueLeaseRef = React.useRef<MemoryEditRecoveryQueueLease | null>(null);
  const queueUnsubscribeRef = React.useRef<(() => void) | null>(null);
  const restorationCursorRef = React.useRef<{
    identity: string;
    cursor: { pageId: string; index: number };
  } | null>(null);
  const retryRecoveryReadRef = React.useRef<(() => void) | null>(null);
  const saveInFlightRef = React.useRef(false);
  const saveMemoryEditDraftRef = React.useRef(saveMemoryEditDraft);
  const saveGenerationRef = React.useRef(0);
  const updatePagesRef = React.useRef(updatePages);
  const currentLoadKeyRef = React.useRef(loadKey);

  activePageRef.current = activePage;
  clearMemoryEditDraftRef.current = clearMemoryEditDraft;
  getMemoryEditDraftRef.current = getMemoryEditDraft;
  memoryRef.current = memory;
  pagesRef.current = pages;
  saveMemoryEditDraftRef.current = saveMemoryEditDraft;
  updatePagesRef.current = updatePages;
  currentLoadKeyRef.current = loadKey;

  React.useEffect(() => {
    const currentMemory = memoryRef.current;
    const nextMetadata = currentMemory
      ? { identity: loadIdentity, title: currentMemory.title, travelDate: currentMemory.travelDate }
      : null;
    metadataDraftRef.current = nextMetadata;
    setMetadataDraft(nextMetadata);
  }, [loadIdentity, memory?.id]);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      loadGenerationRef.current += 1;
      editorSessionGenerationRef.current += 1;
      saveGenerationRef.current += 1;
      saveInFlightRef.current = false;
      isTransformPendingRef.current = false;
      retryRecoveryReadRef.current = null;
      queueUnsubscribeRef.current?.();
      queueUnsubscribeRef.current = null;
      queueLeaseRef.current?.release();
      queueLeaseRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (savedMemory) {
      setLoadedDraft(null);
      return;
    }
    let active = true;
    void getDraftById(id)
      .then((draft) => {
        if (active) setLoadedDraft({ loadKey: fallbackDraftLoadKey, memory: draft });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [fallbackDraftLoadKey, getDraftById, id, savedMemory]);

  React.useEffect(() => {
    const loadedMemory = memoryRef.current;
    const invalidateSession = () => {
      loadGenerationRef.current += 1;
      editorSessionGenerationRef.current += 1;
      saveGenerationRef.current += 1;
      saveInFlightRef.current = false;
      isTransformPendingRef.current = false;
      retryRecoveryReadRef.current = null;
      queueUnsubscribeRef.current?.();
      queueUnsubscribeRef.current = null;
      queueLeaseRef.current?.release();
      queueLeaseRef.current = null;
      editorRef.current?.releaseSaveLock();
      editorCommitLockedRef.current = false;
      setEditorSessionToken(null);
      setIsFormalSaveCompleted(false);
      if (isMountedRef.current) {
        setIsSaving(false);
        setIsTransformPending(false);
        setSaveError(null);
        setRecoveryReadError(false);
      }
    };
    if (!loadedMemory) {
      initializedLoadKeyRef.current = null;
      invalidateSession();
      setIsRecoveryLoading(true);
      setPages([]);
      return;
    }
    if (initializedLoadKeyRef.current === loadKey) return;

    initializedLoadKeyRef.current = loadKey;
    invalidateSession();
    const generation = loadGenerationRef.current;
    const sessionToken = editorSessionGenerationRef.current;
    completedFormalSaveRef.current = null;
    activePageRef.current = null;
    setActivePage(null);
    setDidRecover(false);
    setIsRecoveryLoading(true);
    setRecoveryReadError(false);
    setPages([]);
    setRecoveryState({ status: "saved" });

    if (!isSavedMemory) {
      const initialPages = canvasPages(loadedMemory.pages);
      pagesRef.current = initialPages;
      setPages(initialPages);
      setIsRecoveryLoading(false);
      setEditorSessionToken(sessionToken);
      return;
    }

    const saveRecoveryForSession = saveMemoryEditDraftRef.current;
    const queueLease = acquireMemoryEditRecoveryQueue(loadKey, async (snapshot) => {
      try {
        await saveRecoveryForSession(loadedMemory, snapshot);
      } catch (error) {
        localDiagnostics.emit("recovery_write_failed", {
          code: "write_failed",
          memoryId: loadedMemory.id,
        });
        throw error;
      }
    });
    queueLeaseRef.current = queueLease;
    const queue = queueLease.queue;
    setRecoveryState(queue.getState());
    queueUnsubscribeRef.current = queue.subscribe((state) => {
      if (isMountedRef.current && generation === loadGenerationRef.current) {
        setRecoveryState(state);
      }
    });

    const latestSnapshot = queueLease.getLatestSnapshot();
    if (latestSnapshot) {
      const initialPages = canvasPages(latestSnapshot);
      pagesRef.current = initialPages;
      setPages(initialPages);
      setDidRecover(true);
      setIsRecoveryLoading(false);
      setEditorSessionToken(sessionToken);
      retryRecoveryReadRef.current = null;
      localDiagnostics.emit("recovery_restored", {
        memoryId: loadedMemory.id,
        source: "memory",
      });
      return;
    }

    const getRecoveryForSession = getMemoryEditDraftRef.current;
    const readRecovery = () => {
      if (!isMountedRef.current || generation !== loadGenerationRef.current) return;
      setIsRecoveryLoading(true);
      setRecoveryReadError(false);
      void queue.waitForIdle().then(() => getRecoveryForSession(loadedMemory)).then((recoveredPages) => {
        if (!isMountedRef.current || generation !== loadGenerationRef.current) return;
        const initialPages = canvasPages(recoveredPages ?? loadedMemory.pages);
        pagesRef.current = initialPages;
        setPages(initialPages);
        setDidRecover(recoveredPages !== null);
        setIsRecoveryLoading(false);
        setEditorSessionToken(sessionToken);
        retryRecoveryReadRef.current = null;
        if (recoveredPages !== null) {
          localDiagnostics.emit("recovery_restored", {
            memoryId: loadedMemory.id,
            source: "sqlite",
          });
        }
      })
      .catch(() => {
        if (!isMountedRef.current || generation !== loadGenerationRef.current) return;
        setIsRecoveryLoading(false);
        setRecoveryReadError(true);
      });
    };
    retryRecoveryReadRef.current = () => {
      queue.retry();
      readRecovery();
    };
    readRecovery();
  }, [isSavedMemory, loadKey, memory?.id]);

  const changePages = React.useCallback((nextPages: StoryPage[]) => {
    if (!isMountedRef.current
      || editorSessionToken === null
      || editorSessionToken !== editorSessionGenerationRef.current
      || currentLoadKeyRef.current !== loadKey
      || editorCommitLockedRef.current) {
      return false;
    }
    const stablePages = canvasPages(nextPages);
    pagesRef.current = stablePages;
    setPages(stablePages);
    queueLeaseRef.current?.enqueue(stablePages);
    return true;
  }, [editorSessionToken, loadKey]);

  const changeActivePage = React.useCallback((cursor: { pageId: string; index: number }) => {
    if (!isMountedRef.current
      || editorSessionToken === null
      || editorSessionToken !== editorSessionGenerationRef.current
      || currentLoadKeyRef.current !== loadKey
      || editorCommitLockedRef.current) {
      return;
    }
    activePageRef.current = cursor;
    restorationCursorRef.current = { cursor, identity: loadIdentity };
    setActivePage(cursor);
  }, [editorSessionToken, loadIdentity, loadKey]);

  const changeTransformPending = React.useCallback((pending: boolean) => {
    if (!isMountedRef.current
      || editorSessionToken === null
      || editorSessionToken !== editorSessionGenerationRef.current
      || currentLoadKeyRef.current !== loadKey
      || editorCommitLockedRef.current) {
      return;
    }
    isTransformPendingRef.current = pending;
    setIsTransformPending(pending);
    if (!pending) {
      setSaveError((current) => current === PREPARE_SAVE_PENDING_MESSAGE ? null : current);
    }
  }, [editorSessionToken, loadKey]);

  const updateMetadata = (change: Partial<AlbumMetadataValue>) => {
    const current = metadataDraftRef.current;
    const nextTravelDate = change.travelDate;
    if (!current
      || current.identity !== loadIdentity
      || saveInFlightRef.current
      || editorCommitLockedRef.current
      || isSaving
      || isFormalSaveCompleted
      || nextTravelDate === null) return;
    const next = {
      ...current,
      ...(change.title === undefined ? {} : { title: change.title }),
      ...(nextTravelDate === undefined ? {} : { travelDate: nextTravelDate }),
    };
    metadataDraftRef.current = next;
    setMetadataDraft(next);
  };

  if (!memory) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text selectable style={styles.muted}>正在读取可编辑的旅行册…</Text>
      </ScrollView>
    );
  }

  if (isRecoveryLoading || pages.length === 0) {
    if (recoveryReadError) {
      return (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <Pressable
            accessibilityLiveRegion="polite"
            accessibilityRole="button"
            onPress={() => retryRecoveryReadRef.current?.()}
          >
            <Text selectable style={styles.error}>读取未保存编辑失败，点击重试。</Text>
          </Pressable>
        </ScrollView>
      );
    }
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text accessibilityLiveRegion="polite" role="status" selectable style={styles.muted}>
          正在读取未保存的编辑…
        </Text>
      </ScrollView>
    );
  }

  const currentMetadata = metadataDraft?.identity === loadIdentity
    ? metadataDraft
    : { identity: loadIdentity, title: memory.title, travelDate: memory.travelDate };
  const cityName = (cityContent as Record<string, { name: string }>)[memory.city]?.name ?? memory.city;
  const metadataControlsDisabled = isSaving || isFormalSaveCompleted;

  const save = async ({ navigate }: { navigate: boolean }) => {
    const sessionToken = editorSessionToken;
    const sessionLoadKey = loadKey;
    const sessionMemory = memoryRef.current;
    const sessionMetadata = metadataDraftRef.current;
    if (saveInFlightRef.current
      || sessionToken === null
      || sessionToken !== editorSessionGenerationRef.current
      || sessionLoadKey !== currentLoadKeyRef.current
      || !sessionMemory
      || sessionMetadata?.identity !== loadIdentity) {
      return;
    }
    if (!sessionMetadata.title.trim()) {
      setSaveError("请输入纪念册标题");
      return;
    }
    const recoveryLease = queueLeaseRef.current;
    const recoveryQueue = recoveryLease?.queue ?? null;
    const updatePagesForSession = updatePagesRef.current;
    const clearRecoveryForSession = clearMemoryEditDraftRef.current;
    const routerForSession = router;
    saveInFlightRef.current = true;
    editorCommitLockedRef.current = true;
    const generation = ++saveGenerationRef.current;
    const isCurrentSave = () => (
      isMountedRef.current
      && generation === saveGenerationRef.current
      && sessionToken === editorSessionGenerationRef.current
      && sessionLoadKey === currentLoadKeyRef.current
    );
    setIsSaving(true);
    setSaveError(null);
    localDiagnostics.emit("formal_save_started", { memoryId: sessionMemory.id });
    try {
      let completedSave = completedFormalSaveRef.current;
      if (completedSave
        && (completedSave.sessionToken !== sessionToken || completedSave.loadKey !== sessionLoadKey)) {
        return;
      }
      if (!completedSave) {
        const prepared = await editorRef.current?.prepareSave();
        if (!isCurrentSave()) return;
        if (!prepared) {
          setSaveError(PREPARE_SAVE_PENDING_MESSAGE);
          return;
        }
        isTransformPendingRef.current = false;
        setIsTransformPending(false);
        const preparedDiffersFromParent = prepared.pages !== pagesRef.current;
        const latestPages = canvasPages(prepared.pages);
        const cursor = prepared.cursor;
        pagesRef.current = latestPages;
        activePageRef.current = cursor;
        restorationCursorRef.current = { cursor, identity: loadIdentity };
        setPages(latestPages);
        setActivePage(cursor);
        if (preparedDiffersFromParent) recoveryQueue?.enqueue(latestPages);
        try {
          await recoveryQueue?.waitForIdle();
        } catch {
          // Explicit formal save is the fallback when the recovery queue failed.
        }
        if (!isCurrentSave()) return;
        try {
          const formalSnapshot = {
            ...sessionMemory,
            title: sessionMetadata.title,
            travelDate: sessionMetadata.travelDate,
            pages: latestPages,
          };
          await updatePagesForSession(formalSnapshot, latestPages);
          localDiagnostics.emit("formal_persistence_succeeded", {
            memoryId: sessionMemory.id,
          });
        } catch (error) {
          localDiagnostics.emit("formal_persistence_failed", {
            code: "write_failed",
            memoryId: sessionMemory.id,
          });
          throw error;
        }
        if (!isCurrentSave()) return;
        await recoveryQueue?.clearAndWait();
        if (!isCurrentSave()) return;
        completedSave = {
          cursor,
          loadKey: sessionLoadKey,
          memoryId: sessionMemory.id,
          sessionToken,
        };
        completedFormalSaveRef.current = completedSave;
        setIsFormalSaveCompleted(true);
      }

      try {
        await clearRecoveryForSession(completedSave.memoryId);
        localDiagnostics.emit("recovery_clear_succeeded", {
          memoryId: completedSave.memoryId,
        });
      } catch (error) {
        localDiagnostics.emit("recovery_clear_failed", {
          code: "clear_failed",
          memoryId: completedSave.memoryId,
        });
        throw error;
      }
      if (!isCurrentSave()) return;
      recoveryLease?.clearLatestSnapshot();
      localDiagnostics.emit("navigation_boundary", { memoryId: completedSave.memoryId });
      if (navigate) {
        routerForSession.dismissTo({
          pathname: "/memory/[id]",
          params: {
            id: completedSave.memoryId,
            pageId: completedSave.cursor.pageId,
            pageIndex: String(completedSave.cursor.index),
          },
        });
      } else {
        completedFormalSaveRef.current = null;
        editorCommitLockedRef.current = false;
        editorRef.current?.releaseSaveLock();
        setIsFormalSaveCompleted(false);
      }
    } catch {
      if (isCurrentSave()) {
        setSaveError(completedFormalSaveRef.current
          ? "旅行册已保存，但未能清除恢复副本，请重试。"
          : "保存失败，请稍后重试。");
      }
    } finally {
      if (generation === saveGenerationRef.current
        && sessionToken === editorSessionGenerationRef.current
        && sessionLoadKey === currentLoadKeyRef.current) {
        saveInFlightRef.current = false;
        if (!completedFormalSaveRef.current && editorCommitLockedRef.current) {
          editorCommitLockedRef.current = false;
          editorRef.current?.releaseSaveLock();
        }
        if (isMountedRef.current) setIsSaving(false);
      }
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="memory-canvas-edit-scroll">
      <AlbumMetadataEditor
        key={loadIdentity}
        contextLabel={cityName}
        disabled={metadataControlsDisabled}
        onChange={(change) => updateMetadata(change)}
        title={currentMetadata.title}
        travelDate={currentMetadata.travelDate}
      />
      <Text selectable style={styles.muted} testID="memory-canvas-edit-instruction">
        双击组件进入编辑；未选中时横滑书页可翻页。这里仍采用显式保存，点击下方按钮前不会写入旅行册。
      </Text>
      {didRecover ? (
        <Text accessibilityLiveRegion="polite" role="status" selectable style={styles.recovered}>
          已恢复上次未保存的编辑
        </Text>
      ) : null}
      <View pointerEvents={isSaving || isFormalSaveCompleted ? "none" : "auto"}>
        <BookCanvasEditor
          fallbackIndex={restorationCursorRef.current?.identity === loadIdentity
            ? restorationCursorRef.current.cursor.index
            : parseFallbackIndex(pageIndex)}
          initialPageId={restorationCursorRef.current?.identity === loadIdentity
            ? restorationCursorRef.current.cursor.pageId
            : typeof pageId === "string" ? pageId : undefined}
          onActivePageChange={changeActivePage}
          onPagesChange={changePages}
          onTransformPendingChange={changeTransformPending}
          pages={pages}
          persistSelectedPhoto={(uri) => persistSelectedPhoto(memory.id, uri)}
          ref={editorRef}
          stageSelectedPhoto={(uri) => stageSelectedPhoto(memory.id, uri)}
        />
      </View>
      {recoveryState.status === "error" ? (
        <Pressable
          accessibilityLiveRegion="polite"
          accessibilityRole="button"
          onPress={() => {
            localDiagnostics.emit("recovery_write_retried", { memoryId: memory.id });
            queueLeaseRef.current?.queue.retry();
          }}
        >
          <Text selectable style={styles.error}>未保存编辑的恢复副本写入失败，点击重试。</Text>
        </Pressable>
      ) : null}
      {saveError ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" selectable style={styles.error}>
          {saveError}
        </Text>
      ) : null}
      <AppButton
        disabled={isSaving || isTransformPending}
        label={isSaving ? "正在保存…" : "保存当前修改"}
        onPress={() => {
          void save({ navigate: false }).catch(() => undefined);
        }}
        tone="secondary"
      />
      <AppButton
        disabled={isSaving || isTransformPending}
        label={isSaving ? "正在保存…" : "保存并退出画布"}
        onPress={() => {
          void save({ navigate: true }).catch(() => undefined);
        }}
      />
      </ScrollView>
    </View>
  );
}

function parseFallbackIndex(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 16, paddingBottom: 28, paddingTop: 14 },
  muted: { color: colors.muted, lineHeight: 22, paddingHorizontal: 20 },
  recovered: { color: colors.muted, fontWeight: "700", paddingHorizontal: 20 },
  error: { color: colors.danger, paddingHorizontal: 20 },
});
