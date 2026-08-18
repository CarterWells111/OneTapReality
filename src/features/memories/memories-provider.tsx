import * as React from "react";
import { useSQLiteContext } from "expo-sqlite";

import { DemoDraftGenerator } from "../../services/ai/demo-draft-generator";
import { useAuth } from "../auth/auth-provider";
import { normalizeLocalAccountKey } from "../auth/local-account";
import { isMissingPhotoToken } from "./photo-references";
import { deleteAccountPhotoDirectory, deleteMemoryPhotoDirectory, ensureMemoryPhotosPersisted, hydrateMemoryPhotoReferences, persistPhotoUriStrict } from "./photo-persistence";
import {
  clearMemoryEditDraft as clearMemoryEditDraftInDb,
  getMemoryEditDraft as getMemoryEditDraftFromDb,
  saveMemoryEditDraft as saveMemoryEditDraftInDb,
} from "../../storage/memory-edit-draft-repository";
import {
  clearMemories,
  claimUnownedMemories,
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
  replaceMemoryMediaSnapshot,
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
  getMemoryEditDraft: (memory: Memory) => Promise<StoryPage[] | null>;
  saveMemoryEditDraft: (memory: Memory, pages: StoryPage[]) => Promise<void>;
  clearMemoryEditDraft: (memoryId: string) => Promise<void>;
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

function restoreKnownMissingPhotoTokens(memory: Memory, baseline: ReadonlyMap<string, string>): Memory {
  const restoreUri = (uri: string | undefined): string | undefined => {
    if (uri && isMissingPhotoToken(uri)) {
      const stored = baseline.get(uri);
      if (!stored) throw new Error("Unknown missing local photo token");
      return stored;
    }
    return uri;
  };
  return {
    ...memory,
    coverImage: restoreUri(memory.coverImage),
    photoUris: memory.photoUris.map((uri) => restoreUri(uri) ?? uri),
    pages: memory.pages.map((page) => ({
      ...page,
      photoUri: restoreUri(page.photoUri),
      coverImage: restoreUri(page.coverImage),
      layout: page.layout ? {
        ...page.layout,
        coverImage: restoreUri(page.layout.coverImage),
        elements: page.layout.elements.map((element) => (
          element.type === "image" ? { ...element, uri: restoreUri(element.uri) ?? element.uri } : element
        )),
      } : undefined,
    })),
  };
}

export function MemoriesProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { isAuthReady, user } = useAuth();
  const accountKey = user ? normalizeLocalAccountKey(user.email) : null;
  const [memories, setMemories] = React.useState<Memory[]>([]);
  const [isReady, setIsReady] = React.useState(false);
  const refreshGeneration = React.useRef(0);
  const missingPhotoBaselines = React.useRef(new Map<string, Map<string, string>>());
  const currentAccountKey = React.useRef<string | null>(accountKey);
  currentAccountKey.current = accountKey;

  const requireAccountKey = React.useCallback(() => {
    if (!isAuthReady || !accountKey) throw new Error("请先登录后再管理本地旅行册");
    return accountKey;
  }, [accountKey, isAuthReady]);

  const baselineKey = React.useCallback((owner: string, memoryId: string) => `${owner}\0${memoryId}`, []);

  const recordHydration = React.useCallback((memoryId: string, owner: string, hydrated: Awaited<ReturnType<typeof hydrateMemoryPhotoReferences>>) => {
    const baseline = new Map<string, string>();
    for (const unresolved of hydrated.unresolved) baseline.set(unresolved.token, unresolved.storedReference);
    missingPhotoBaselines.current.set(baselineKey(owner, memoryId), baseline);
    return hydrated;
  }, [baselineKey]);

  const baselineFor = React.useCallback(
    (owner: string, memoryId: string) => missingPhotoBaselines.current.get(baselineKey(owner, memoryId)) ?? new Map<string, string>(),
    [baselineKey],
  );

  const hydrateForStorage = React.useCallback(async (memory: Memory, owner: string) => (
    recordHydration(memory.id, owner, await hydrateMemoryPhotoReferences(memory, owner))
  ), [recordHydration]);

  const hydrateForRuntime = React.useCallback(async (memory: Memory, owner: string): Promise<Memory> => {
    const hydrated = await hydrateForStorage(memory, owner);
    if (hydrated.changed) {
      const replaced = await replaceMemoryMediaSnapshot(db, hydrated.storageMemory, owner);
      if (!replaced) throw new Error("Album no longer belongs to the active account");
    }
    return hydrated.runtimeMemory;
  }, [db, hydrateForStorage]);

  /** 读取当前账号的记忆，并以原子快照迁移照片引用。 */
  const refresh = React.useCallback(async (requestedAccountKey?: string) => {
    const owner = requestedAccountKey ?? requireAccountKey();
    const generation = ++refreshGeneration.current;
    await claimUnownedMemories(db, owner);
    const runtimeMemories = await Promise.all(
      (await listMemories(db, owner)).map((memory) => hydrateForRuntime(memory, owner)),
    );
    if (generation === refreshGeneration.current && currentAccountKey.current === owner) {
      setMemories(runtimeMemories);
      setIsReady(true);
    }
  }, [db, hydrateForRuntime, requireAccountKey]);

  React.useEffect(() => {
    refreshGeneration.current += 1;
    missingPhotoBaselines.current.clear();
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
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      await saveMemory(db, hydrated.storageMemory, owner);
      await refresh();
      return hydrated.runtimeMemory;
    },
    [db, hydrateForStorage, refresh, requireAccountKey]
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
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      await createDraftInDb(db, hydrated.storageMemory, owner);
      return { ...hydrated.runtimeMemory, status: "draft" as const };
    },
    [db, hydrateForStorage, requireAccountKey]
  );

  const getDraftById = React.useCallback(async (id: string) => {
    const owner = requireAccountKey();
    const draft = await getDraft(db, id, owner);
    return draft ? hydrateForRuntime(draft, owner) : null;
  }, [db, hydrateForRuntime, requireAccountKey]);

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
      const nextDraft = restoreKnownMissingPhotoTokens({ ...draft, pages: namespacedPages, updatedAt: new Date().toISOString() }, baselineFor(owner, id));
      const persisted = await ensureMemoryPhotosPersisted(nextDraft, owner);
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      if (!await replaceMemoryMediaSnapshot(db, hydrated.storageMemory, owner)) {
        throw new Error("Album no longer belongs to the active account");
      }
      return hydrated.runtimeMemory;
    },
    [baselineFor, db, hydrateForStorage, requireAccountKey]
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
      const persisted = await ensureMemoryPhotosPersisted(restoreKnownMissingPhotoTokens({
        ...memory,
        pages,
        updatedAt: new Date().toISOString(),
      }, baselineFor(owner, memory.id)), owner);
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      if (!await replaceMemoryMediaSnapshot(db, hydrated.storageMemory, owner)) {
        throw new Error("Album no longer belongs to the active account");
      }
      await refresh();
    },
    [baselineFor, db, hydrateForStorage, refresh, requireAccountKey]
  );

  const updateDraftPages = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => {
      const owner = requireAccountKey();
      const persisted = await ensureMemoryPhotosPersisted(restoreKnownMissingPhotoTokens({
        ...memory,
        pages,
        updatedAt: new Date().toISOString(),
      }, baselineFor(owner, memory.id)), owner);
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      if (!await replaceMemoryMediaSnapshot(db, hydrated.storageMemory, owner)) {
        throw new Error("Album no longer belongs to the active account");
      }
    },
    [baselineFor, db, hydrateForStorage, requireAccountKey]
  );

  const getMemoryEditDraft = React.useCallback(async (memory: Memory) => {
    const owner = requireAccountKey();
    const pages = await getMemoryEditDraftFromDb(db, memory, owner);
    if (!pages) return null;
    const hydrated = await hydrateForStorage(
      restoreKnownMissingPhotoTokens({ ...memory, pages }, baselineFor(owner, memory.id)),
      owner,
    );
    if (hydrated.changed) {
      await saveMemoryEditDraftInDb(db, memory, hydrated.storageMemory.pages, owner);
    }
    return hydrated.runtimeMemory.pages;
  }, [baselineFor, db, hydrateForStorage, requireAccountKey]);

  const saveMemoryEditDraft = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => {
      const owner = requireAccountKey();
      const persisted = await ensureMemoryPhotosPersisted(
        restoreKnownMissingPhotoTokens({ ...memory, pages }, baselineFor(owner, memory.id)),
        owner,
      );
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      await saveMemoryEditDraftInDb(db, memory, hydrated.storageMemory.pages, owner);
    },
    [baselineFor, db, hydrateForStorage, requireAccountKey],
  );

  const clearMemoryEditDraft = React.useCallback(
    async (memoryId: string) => {
      await clearMemoryEditDraftInDb(db, memoryId, requireAccountKey());
    },
    [db, requireAccountKey],
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

  const listDiscarded = React.useCallback(async () => {
    const owner = requireAccountKey();
    return Promise.all((await listDiscardedMemories(db, owner)).map((memory) => hydrateForRuntime(memory, owner)));
  }, [db, hydrateForRuntime, requireAccountKey]);

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
      getMemoryEditDraft,
      saveMemoryEditDraft,
      clearMemoryEditDraft,
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
      getMemoryEditDraft,
      isReady,
      listDiscarded,
      memories,
      restoreMemory,
      retryDraft,
      saveDraft,
      saveMemoryEditDraft,
      updatePages,
      updateDraftPages,
      persistSelectedPhoto,
      clearMemoryEditDraft,
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
