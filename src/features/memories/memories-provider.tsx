import * as React from "react";
import { useSQLiteContext } from "expo-sqlite";

import { DemoDraftGenerator } from "../../services/ai/demo-draft-generator";
import { useAuth } from "../auth/auth-provider";
import { normalizeLocalAccountKey } from "../auth/local-account";
import { cleanupMigratedLegacyPhotoUris, deleteAccountPhotoDirectory, deleteMemoryPhotoDirectory, ensureMemoryPhotosPersisted, findMigratedLegacyPhotoUris, persistPhotoUriStrict } from "./photo-persistence";
import {
  clearMemories,
  claimUnownedMemories,
  createDraft as createDraftInDb,
  deleteMemory as deleteMemoryFromDb,
  discardDraft as discardDraftInDb,
  discardMemory as discardMemoryInDb,
  getDraft,
  listAllMemories,
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
  persistSelectedPhoto: (memoryId: string, uri: string) => Promise<string>;
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
  const { isAuthReady, user } = useAuth();
  const accountKey = user ? normalizeLocalAccountKey(user.email) : null;
  const [memories, setMemories] = React.useState<Memory[]>([]);
  const [isReady, setIsReady] = React.useState(false);
  const refreshGeneration = React.useRef(0);
  const currentAccountKey = React.useRef<string | null>(accountKey);
  currentAccountKey.current = accountKey;

  const requireAccountKey = React.useCallback(() => {
    if (!isAuthReady || !accountKey) throw new Error("请先登录后再管理本地旅行册");
    return accountKey;
  }, [accountKey, isAuthReady]);

  /** 读取全部记忆并迁移旧照片 URI 到沙盒（best-effort，失败不阻塞列表）。 */
  const refresh = React.useCallback(async (requestedAccountKey?: string) => {
    const owner = requestedAccountKey ?? requireAccountKey();
    const generation = ++refreshGeneration.current;
    await claimUnownedMemories(db, owner);
    let nextMemories = await listMemories(db, owner);
    let migratedAny = false;
    const migratedLegacyUris = new Set<string>();
    for (const memory of nextMemories) {
      try {
        const result = await ensureMemoryPhotosPersisted(memory, owner);
        if (result.changed) {
          migratedAny = true;
          await updateMemoryPhotos(db, result.memory.id, result.memory.photoUris, owner);
          await updateMemoryPages(db, {
            ...result.memory,
            updatedAt: result.memory.updatedAt,
          }, owner);
          for (const uri of findMigratedLegacyPhotoUris(memory, result.memory)) migratedLegacyUris.add(uri);
        }
      } catch (error) {
        console.warn("[MemoriesProvider] 照片持久化迁移失败，跳过：", error);
      }
    }
    if (migratedAny) {
      // 迁移写入后再读一次，保证返回给 UI 的是持久化后的 URI
      nextMemories = await listMemories(db, owner);
    }
    if (migratedLegacyUris.size > 0) {
      const everyOwnedMemory = await listAllMemories(db, owner);
      await cleanupMigratedLegacyPhotoUris([...migratedLegacyUris], everyOwnedMemory);
    }
    if (generation === refreshGeneration.current && currentAccountKey.current === owner) {
      setMemories(nextMemories);
      setIsReady(true);
    }
  }, [db, requireAccountKey]);

  React.useEffect(() => {
    refreshGeneration.current += 1;
    setMemories([]);
    if (!isAuthReady) {
      setIsReady(false);
      return;
    }
    if (!accountKey) {
      setIsReady(true);
      return;
    }
    setIsReady(false);
    void refresh(accountKey).catch((error) => {
      if (currentAccountKey.current === accountKey) {
        console.warn("[MemoriesProvider] 无法读取当前账号的本地旅行册：", error);
        setIsReady(true);
      }
    });
  }, [accountKey, isAuthReady, refresh]);

  const createMemory = React.useCallback(
    async (input: MemoryDraftInput) => {
      const owner = requireAccountKey();
      const validation = validateMemoryDraft(input);
      if (validation.issues.length > 0) {
        throw new Error(validation.issues[0]);
      }

      const pages = await generator.generate(input);
      const now = new Date().toISOString();
      const memory = createMemoryRecord({ id: buildId(), now, input, pages });
      const persisted = await ensureMemoryPhotosPersisted(memory, owner);
      await saveMemory(db, persisted.memory, owner);
      await refresh();
      return persisted.memory;
    },
    [db, refresh, requireAccountKey]
  );

  const createDraft = React.useCallback(
    async (input: MemoryDraftInput) => {
      const owner = requireAccountKey();
      const validation = validateMemoryDraft(input);
      if (validation.issues.length > 0) {
        throw new Error(validation.issues[0]);
      }

      const pages = await generator.generate(input);
      const now = new Date().toISOString();
      const memory = createMemoryRecord({ id: buildId(), now, input, pages });
      const persisted = await ensureMemoryPhotosPersisted(memory, owner);
      await createDraftInDb(db, persisted.memory, owner);
      return { ...persisted.memory, status: "draft" as const };
    },
    [db, requireAccountKey]
  );

  const getDraftById = React.useCallback(
    async (id: string) => getDraft(db, id, requireAccountKey()),
    [db, requireAccountKey]
  );

  const saveDraft = React.useCallback(
    async (id: string) => {
      await saveDraftInDb(db, id, new Date().toISOString(), requireAccountKey());
      await refresh();
    },
    [db, refresh, requireAccountKey]
  );

  const retryDraft = React.useCallback(
    async (id: string) => {
      const owner = requireAccountKey();
      const draft = await getDraft(db, id, owner);
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
      const persisted = await ensureMemoryPhotosPersisted(nextDraft, owner);
      await updateMemoryPages(db, persisted.memory, owner);
      return persisted.memory;
    },
    [db, requireAccountKey]
  );

  const discardDraft = React.useCallback(
    async (id: string) => {
      await discardDraftInDb(db, id, new Date().toISOString(), requireAccountKey());
      await refresh();
    },
    [db, refresh, requireAccountKey]
  );

  const updatePages = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => {
      const owner = requireAccountKey();
      const persisted = await ensureMemoryPhotosPersisted({
        ...memory,
        pages,
        updatedAt: new Date().toISOString(),
      }, owner);
      await updateMemoryPages(db, persisted.memory, owner);
      await refresh();
    },
    [db, refresh, requireAccountKey]
  );

  const updateDraftPages = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => {
      const owner = requireAccountKey();
      const persisted = await ensureMemoryPhotosPersisted({
        ...memory,
        pages,
        updatedAt: new Date().toISOString(),
      }, owner);
      await updateMemoryPages(db, persisted.memory, owner);
    },
    [db, requireAccountKey]
  );

  const persistSelectedPhoto = React.useCallback(
    async (memoryId: string, uri: string) => persistPhotoUriStrict(uri, requireAccountKey(), memoryId),
    [requireAccountKey],
  );

  const discardMemory = React.useCallback(
    async (id: string) => {
      await discardMemoryInDb(db, id, new Date().toISOString(), requireAccountKey());
      await refresh();
    },
    [db, refresh, requireAccountKey]
  );

  const deleteMemory = React.useCallback(
    async (id: string) => {
      const owner = requireAccountKey();
      await deleteMemoryFromDb(db, id, owner);
      await deleteMemoryPhotoDirectory(owner, id);
      await refresh();
    },
    [db, refresh, requireAccountKey]
  );

  const clearAllMemories = React.useCallback(async () => {
    const owner = requireAccountKey();
    await clearMemories(db, owner);
    await deleteAccountPhotoDirectory(owner);
    await refresh();
  }, [db, refresh, requireAccountKey]);

  const listDiscarded = React.useCallback(
    async () => listDiscardedMemories(db, requireAccountKey()),
    [db, requireAccountKey]
  );

  const restoreMemory = React.useCallback(
    async (id: string) => {
      await restoreDiscardedMemory(db, id, new Date().toISOString(), requireAccountKey());
      await refresh();
    },
    [db, refresh, requireAccountKey]
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
      persistSelectedPhoto,
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
      persistSelectedPhoto,
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
