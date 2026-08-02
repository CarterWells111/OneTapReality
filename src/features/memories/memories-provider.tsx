import * as React from "react";
import { useSQLiteContext } from "expo-sqlite";

import { DemoDraftGenerator } from "../../services/ai/demo-draft-generator";
import { ensureMemoryPhotosPersisted } from "./photo-persistence";
import {
  clearMemories,
  createDraft as createDraftInDb,
  deleteMemory as deleteMemoryFromDb,
  discardDraft as discardDraftInDb,
  discardMemory as discardMemoryInDb,
  getDraft,
  listDiscardedMemories,
  listMemories,
  restoreDiscardedMemory,
  saveDraft as saveDraftInDb,
  saveMemory,
  updateMemoryPages,
  updateMemoryPhotos,
} from "../../storage/memory-repository";
import type { Memory, MemoryDraftInput, StoryPage } from "../../types/memory";
import { createMemory as createMemoryRecord } from "./memory-factory";
import { validateMemoryDraft } from "./validation";

type MemoriesContextValue = {
  memories: Memory[];
  isReady: boolean;
  createMemory: (input: MemoryDraftInput) => Promise<Memory>;
  createDraft: (input: MemoryDraftInput) => Promise<Memory>;
  getDraftById: (id: string) => Promise<Memory | null>;
  saveDraft: (id: string) => Promise<void>;
  retryDraft: (id: string) => Promise<Memory>;
  discardDraft: (id: string) => Promise<void>;
  updatePages: (memory: Memory, pages: StoryPage[]) => Promise<void>;
  updateDraftPages: (memory: Memory, pages: StoryPage[]) => Promise<void>;
  discardMemory: (id: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  clearAllMemories: () => Promise<void>;
  getMemoryById: (id: string) => Memory | undefined;
  listDiscarded: () => Promise<Memory[]>;
  restoreMemory: (id: string) => Promise<void>;
};

const MemoriesContext = React.createContext<MemoriesContextValue | undefined>(undefined);
const generator = new DemoDraftGenerator();

function buildId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function MemoriesProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [memories, setMemories] = React.useState<Memory[]>([]);
  const [isReady, setIsReady] = React.useState(false);

  /** 读取全部记忆并迁移旧照片 URI 到沙盒（best-effort，失败不阻塞列表）。 */
  const refresh = React.useCallback(async () => {
    let memories = await listMemories(db);
    let migratedAny = false;
    for (const memory of memories) {
      try {
        const result = await ensureMemoryPhotosPersisted(memory);
        if (result.changed) {
          migratedAny = true;
          await updateMemoryPhotos(db, result.memory.id, result.memory.photoUris);
          await updateMemoryPages(db, {
            ...result.memory,
            updatedAt: result.memory.updatedAt,
          });
        }
      } catch (error) {
        console.warn("[MemoriesProvider] 照片持久化迁移失败，跳过：", error);
      }
    }
    if (migratedAny) {
      // 迁移写入后再读一次，保证返回给 UI 的是持久化后的 URI
      memories = await listMemories(db);
    }
    setMemories(memories);
    setIsReady(true);
  }, [db]);

  React.useEffect(() => {
    let isMounted = true;
    void refresh().then(() => {
      if (!isMounted) {
        setIsReady(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [refresh]);

  const createMemory = React.useCallback(
    async (input: MemoryDraftInput) => {
      const validation = validateMemoryDraft(input);
      if (validation.issues.length > 0) {
        throw new Error(validation.issues[0]);
      }

      const pages = await generator.generate(input);
      const now = new Date().toISOString();
      const memory = createMemoryRecord({ id: buildId(), now, input, pages });
      await saveMemory(db, memory);
      await refresh();
      return memory;
    },
    [db, refresh]
  );

  const createDraft = React.useCallback(
    async (input: MemoryDraftInput) => {
      const validation = validateMemoryDraft(input);
      if (validation.issues.length > 0) {
        throw new Error(validation.issues[0]);
      }

      const pages = await generator.generate(input);
      const now = new Date().toISOString();
      const memory = createMemoryRecord({ id: buildId(), now, input, pages });
      await createDraftInDb(db, memory);
      return { ...memory, status: "draft" as const };
    },
    [db]
  );

  const getDraftById = React.useCallback(
    async (id: string) => getDraft(db, id),
    [db]
  );

  const saveDraft = React.useCallback(
    async (id: string) => {
      await saveDraftInDb(db, id, new Date().toISOString());
      await refresh();
    },
    [db, refresh]
  );

  const retryDraft = React.useCallback(
    async (id: string) => {
      const draft = await getDraft(db, id);
      if (!draft) {
        throw new Error("未找到可重试的草稿");
      }

      const pages = await generator.generate(draft);
      // 为页面 id 加命名空间前缀，避免全局主键冲突（与 createMemory 保持一致）
      const namespacedPages = pages.map((page) => ({
        ...page,
        id: `${id}:${page.id}`,
      }));
      const nextDraft = { ...draft, pages: namespacedPages, updatedAt: new Date().toISOString() };
      await updateMemoryPages(db, nextDraft);
      return nextDraft;
    },
    [db]
  );

  const discardDraft = React.useCallback(
    async (id: string) => {
      await discardDraftInDb(db, id, new Date().toISOString());
      await refresh();
    },
    [db, refresh]
  );

  const updatePages = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => {
      await updateMemoryPages(db, {
        ...memory,
        pages,
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    },
    [db, refresh]
  );

  const updateDraftPages = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => {
      await updateMemoryPages(db, {
        ...memory,
        pages,
        updatedAt: new Date().toISOString(),
      });
    },
    [db]
  );

  const discardMemory = React.useCallback(
    async (id: string) => {
      await discardMemoryInDb(db, id, new Date().toISOString());
      await refresh();
    },
    [db, refresh]
  );

  const deleteMemory = React.useCallback(
    async (id: string) => {
      await deleteMemoryFromDb(db, id);
      await refresh();
    },
    [db, refresh]
  );

  const clearAllMemories = React.useCallback(async () => {
    await clearMemories(db);
    await refresh();
  }, [db, refresh]);

  const listDiscarded = React.useCallback(
    async () => listDiscardedMemories(db),
    [db]
  );

  const restoreMemory = React.useCallback(
    async (id: string) => {
      await restoreDiscardedMemory(db, id, new Date().toISOString());
      await refresh();
    },
    [db, refresh]
  );

  const value = React.useMemo<MemoriesContextValue>(
    () => ({
      memories,
      isReady,
      createMemory,
      createDraft,
      getDraftById,
      saveDraft,
      retryDraft,
      discardDraft,
      updatePages,
      updateDraftPages,
      discardMemory,
      deleteMemory,
      clearAllMemories,
      getMemoryById: (id) => memories.find((memory) => memory.id === id),
      listDiscarded,
      restoreMemory,
    }),
    [
      clearAllMemories,
      createDraft,
      createMemory,
      deleteMemory,
      discardMemory,
      discardDraft,
      getDraftById,
      isReady,
      listDiscarded,
      memories,
      restoreMemory,
      retryDraft,
      saveDraft,
      updatePages,
      updateDraftPages,
    ]
  );

  return <MemoriesContext.Provider value={value}>{children}</MemoriesContext.Provider>;
}

export function useMemories() {
  const context = React.use(MemoriesContext);
  if (!context) {
    throw new Error("useMemories must be used inside MemoriesProvider");
  }
  return context;
}
