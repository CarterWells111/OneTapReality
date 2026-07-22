import * as React from "react";
import { useSQLiteContext } from "expo-sqlite";

import { DemoDraftGenerator } from "../../services/ai/demo-draft-generator";
import {
  clearMemories,
  createDraft as createDraftInDb,
  deleteMemory as deleteMemoryFromDb,
  discardDraft as discardDraftInDb,
  getDraft,
  listMemories,
  saveDraft as saveDraftInDb,
  saveMemory,
  updateMemoryPages,
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
  deleteMemory: (id: string) => Promise<void>;
  clearAllMemories: () => Promise<void>;
  getMemoryById: (id: string) => Memory | undefined;
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

  const refresh = React.useCallback(async () => {
    const nextMemories = await listMemories(db);
    setMemories(nextMemories);
    setIsReady(true);
  }, [db]);

  React.useEffect(() => {
    let isMounted = true;
    void listMemories(db).then((nextMemories) => {
      if (isMounted) {
        setMemories(nextMemories);
        setIsReady(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [db]);

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
      const nextDraft = { ...draft, pages, updatedAt: new Date().toISOString() };
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
      deleteMemory,
      clearAllMemories,
      getMemoryById: (id) => memories.find((memory) => memory.id === id),
    }),
    [
      clearAllMemories,
      createDraft,
      createMemory,
      deleteMemory,
      discardDraft,
      getDraftById,
      isReady,
      memories,
      retryDraft,
      saveDraft,
      updatePages,
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
