import * as React from "react";
import { useSQLiteContext } from "expo-sqlite";

import { DemoDraftGenerator } from "../../services/ai/demo-draft-generator";
import { useLocalLibrary } from "../auth/local-library-provider";
import type { LocalLibraryOwner } from "../auth/local-library-owner";
import { isMissingPhotoToken } from "./photo-references";
import { deleteAccountPhotoDirectoryStrict, deleteMemoryPhotoDirectory, ensureMemoryPhotosPersisted, hydrateMemoryPhotoReferences, persistPhotoUriStrict } from "./photo-persistence";
import {
  clearMemoryEditDraft as clearMemoryEditDraftInDb,
  getMemoryEditDraft as getMemoryEditDraftFromDb,
  saveMemoryEditDraft as saveMemoryEditDraftInDb,
} from "../../storage/memory-edit-draft-repository";
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
  replaceMemoryMediaSnapshot,
} from "../../storage/memory-repository";
import type { Memory, MemoryDraftInput, MemoryDraftPagePlan, StoryPage } from "../../types/memory";
import { resolvePhotoTemplate } from "../canvas/photo-templates";
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

/**
 * 从已持久化的页面布局恢复草稿生成所需的临时页面计划。
 * 只有检测到分组照片或匹配模板时才返回计划，以保持旧版一图一页草稿的重试行为。
 */
export function reconstructDraftPagePlans(memory: Memory): MemoryDraftPagePlan[] | undefined {
  const photoPages = memory.pages
    .filter((page) => page.kind === "photo")
    .map((page, index) => ({ page, index }))
    .sort((left, right) => left.page.position - right.page.position || left.index - right.index)
    .map(({ page }) => page);
  const hasPlannedLayout = photoPages.some((page) => {
    const imageCount = page.layout?.elements.filter((element) => element.type === "image").length ?? 0;
    const template = resolvePhotoTemplate(page.layout?.photoTemplateId);
    return imageCount > 1 || (template !== undefined && template.photoCount === imageCount);
  });
  if (!hasPlannedLayout) return undefined;

  return photoPages.map((page) => {
    const imageUris = (page.layout?.elements ?? [])
      .map((element, index) => ({ element, index }))
      .filter((item) => item.element.type === "image")
      .sort((left, right) => left.element.zIndex - right.element.zIndex || left.index - right.index)
      .map((item) => item.element.type === "image" ? item.element.uri : "");
    const photoUris = imageUris.length > 0
      ? imageUris
      : page.photoUri
        ? [page.photoUri]
        : [];
    const template = resolvePhotoTemplate(page.layout?.photoTemplateId);
    return template && template.photoCount === photoUris.length
      ? { photoUris, photoTemplateId: template.id }
      : { photoUris };
  });
}

export function MemoriesProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { isReady: isLibraryReady, owner: accountKey, runWrite } = useLocalLibrary();
  const [memories, setMemories] = React.useState<Memory[]>([]);
  const [memoriesOwner, setMemoriesOwner] = React.useState<LocalLibraryOwner | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const refreshGeneration = React.useRef(0);
  const missingPhotoBaselines = React.useRef(new Map<string, Map<string, string>>());
  const currentAccountKey = React.useRef<string>(accountKey);
  currentAccountKey.current = accountKey;

  const baselineKey = React.useCallback((owner: LocalLibraryOwner, memoryId: string) => `${owner}\0${memoryId}`, []);

  const recordHydration = React.useCallback((memoryId: string, owner: LocalLibraryOwner, hydrated: Awaited<ReturnType<typeof hydrateMemoryPhotoReferences>>) => {
    const baseline = new Map<string, string>();
    for (const unresolved of hydrated.unresolved) baseline.set(unresolved.token, unresolved.storedReference);
    missingPhotoBaselines.current.set(baselineKey(owner, memoryId), baseline);
    return hydrated;
  }, [baselineKey]);

  const baselineFor = React.useCallback(
    (owner: LocalLibraryOwner, memoryId: string) => missingPhotoBaselines.current.get(baselineKey(owner, memoryId)) ?? new Map<string, string>(),
    [baselineKey],
  );

  const hydrateForStorage = React.useCallback(async (memory: Memory, owner: LocalLibraryOwner) => (
    recordHydration(memory.id, owner, await hydrateMemoryPhotoReferences(memory, owner))
  ), [recordHydration]);

  const hydrateForRuntime = React.useCallback(async (memory: Memory, owner: LocalLibraryOwner): Promise<Memory> => {
    const hydrated = await hydrateForStorage(memory, owner);
    if (hydrated.changed) {
      const replaced = await replaceMemoryMediaSnapshot(db, hydrated.storageMemory, owner);
      if (!replaced) throw new Error("Album no longer belongs to the active account");
    }
    return hydrated.runtimeMemory;
  }, [db, hydrateForStorage]);

  /** 读取当前账号的记忆，并以原子快照迁移照片引用。 */
  const refresh = React.useCallback(async (
    owner: LocalLibraryOwner,
    assertActive: () => void,
  ) => {
    assertActive();
    const generation = ++refreshGeneration.current;
    const runtimeMemories = await Promise.all(
      (await listMemories(db, owner)).map((memory) => hydrateForRuntime(memory, owner)),
    );
    assertActive();
    if (generation === refreshGeneration.current && currentAccountKey.current === owner) {
      setMemories(runtimeMemories);
      setMemoriesOwner(owner);
      setIsReady(true);
    }
  }, [db, hydrateForRuntime]);

  React.useEffect(() => {
    refreshGeneration.current += 1;
    missingPhotoBaselines.current.clear();
    setMemories([]);
    setMemoriesOwner(null);
    if (!isLibraryReady) {
      setIsReady(false);
      return;
    }
    setIsReady(false);
    void runWrite((owner, assertActive) => refresh(owner, assertActive)).catch((error) => {
      if (currentAccountKey.current === accountKey) {
        console.warn("[MemoriesProvider] 无法读取当前账号的本地旅行册：", error);
        setIsReady(true);
      }
    });
  }, [accountKey, isLibraryReady, refresh, runWrite]);

  const createMemory = React.useCallback(
    async (input: MemoryDraftInput) => runWrite(async (owner, assertActive) => {
      const validation = validateMemoryDraft(input);
      if (validation.issues.length > 0) {
        throw new Error(validation.issues[0]);
      }

      const pages = await generator.generate(input);
      const now = new Date().toISOString();
      const memory = createMemoryRecord({ id: buildId(), now, input, pages });
      const persisted = await ensureMemoryPhotosPersisted(memory, owner);
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      assertActive();
      await saveMemory(db, hydrated.storageMemory, owner);
      await refresh(owner, assertActive);
      return hydrated.runtimeMemory;
    }),
    [db, hydrateForStorage, refresh, runWrite]
  );

  const createDraft = React.useCallback(
    async (input: MemoryDraftInput) => runWrite(async (owner, assertActive) => {
      const validation = validateMemoryDraft(input);
      if (validation.issues.length > 0) {
        throw new Error(validation.issues[0]);
      }

      const pages = await generator.generate(input);
      const now = new Date().toISOString();
      const memory = createMemoryRecord({ id: buildId(), now, input, pages });
      const persisted = await ensureMemoryPhotosPersisted(memory, owner);
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      assertActive();
      await createDraftInDb(db, hydrated.storageMemory, owner);
      return { ...hydrated.runtimeMemory, status: "draft" as const };
    }),
    [db, hydrateForStorage, runWrite]
  );

  const getDraftById = React.useCallback(async (id: string) => runWrite(async (owner, assertActive) => {
    const draft = await getDraft(db, id, owner);
    const hydrated = draft ? await hydrateForRuntime(draft, owner) : null;
    assertActive();
    return hydrated;
  }), [db, hydrateForRuntime, runWrite]);

  const saveDraft = React.useCallback(
    async (id: string) => runWrite(async (owner, assertActive) => {
      await saveDraftInDb(db, id, new Date().toISOString(), owner);
      await refresh(owner, assertActive);
    }),
    [db, refresh, runWrite]
  );

  const retryDraft = React.useCallback(
    async (id: string) => runWrite(async (owner, assertActive) => {
      const draft = await getDraft(db, id, owner);
      if (!draft) {
        throw new Error("未找到可重试的草稿");
      }

      const pagePlans = reconstructDraftPagePlans(draft);
      const pages = await generator.generate(pagePlans ? { ...draft, pagePlans } : draft);
      // 为页面 id 加命名空间前缀，避免全局主键冲突（与 createMemory 保持一致）
      const namespacedPages = pages.map((page) => ({
        ...page,
        id: `${id}:${page.id}`,
      }));
      const nextDraft = restoreKnownMissingPhotoTokens({ ...draft, pages: namespacedPages, updatedAt: new Date().toISOString() }, baselineFor(owner, id));
      const persisted = await ensureMemoryPhotosPersisted(nextDraft, owner);
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      assertActive();
      if (!await replaceMemoryMediaSnapshot(db, hydrated.storageMemory, owner)) {
        throw new Error("Album no longer belongs to the active account");
      }
      return hydrated.runtimeMemory;
    }),
    [baselineFor, db, hydrateForStorage, runWrite]
  );

  const discardDraft = React.useCallback(
    async (id: string) => runWrite(async (owner, assertActive) => {
      await discardDraftInDb(db, id, new Date().toISOString(), owner);
      await refresh(owner, assertActive);
    }),
    [db, refresh, runWrite]
  );

  const updatePages = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => runWrite(async (owner, assertActive) => {
      const persisted = await ensureMemoryPhotosPersisted(restoreKnownMissingPhotoTokens({
        ...memory,
        pages,
        updatedAt: new Date().toISOString(),
      }, baselineFor(owner, memory.id)), owner);
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      assertActive();
      if (!await replaceMemoryMediaSnapshot(db, hydrated.storageMemory, owner)) {
        throw new Error("Album no longer belongs to the active account");
      }
      await refresh(owner, assertActive);
    }),
    [baselineFor, db, hydrateForStorage, refresh, runWrite]
  );

  const updateDraftPages = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => runWrite(async (owner, assertActive) => {
      const persisted = await ensureMemoryPhotosPersisted(restoreKnownMissingPhotoTokens({
        ...memory,
        pages,
        updatedAt: new Date().toISOString(),
      }, baselineFor(owner, memory.id)), owner);
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      assertActive();
      if (!await replaceMemoryMediaSnapshot(db, hydrated.storageMemory, owner)) {
        throw new Error("Album no longer belongs to the active account");
      }
    }),
    [baselineFor, db, hydrateForStorage, runWrite]
  );

  const getMemoryEditDraft = React.useCallback(async (memory: Memory) => runWrite(async (owner, assertActive) => {
    const pages = await getMemoryEditDraftFromDb(db, memory, owner);
    if (!pages) return null;
    const hydrated = await hydrateForStorage(
      restoreKnownMissingPhotoTokens({ ...memory, pages }, baselineFor(owner, memory.id)),
      owner,
    );
    if (hydrated.changed) {
      assertActive();
      await saveMemoryEditDraftInDb(db, memory, hydrated.storageMemory.pages, owner);
    }
    assertActive();
    return hydrated.runtimeMemory.pages;
  }), [baselineFor, db, hydrateForStorage, runWrite]);

  const saveMemoryEditDraft = React.useCallback(
    async (memory: Memory, pages: StoryPage[]) => runWrite(async (owner, assertActive) => {
      const persisted = await ensureMemoryPhotosPersisted(
        restoreKnownMissingPhotoTokens({ ...memory, pages }, baselineFor(owner, memory.id)),
        owner,
      );
      const hydrated = await hydrateForStorage(persisted.memory, owner);
      assertActive();
      await saveMemoryEditDraftInDb(db, memory, hydrated.storageMemory.pages, owner);
    }),
    [baselineFor, db, hydrateForStorage, runWrite],
  );

  const clearMemoryEditDraft = React.useCallback(
    async (memoryId: string) => runWrite(async (owner) => {
      await clearMemoryEditDraftInDb(db, memoryId, owner);
    }),
    [db, runWrite],
  );

  const persistSelectedPhoto = React.useCallback(
    async (memoryId: string, uri: string) => runWrite(async (owner, assertActive) => {
      const persisted = await persistPhotoUriStrict(uri, owner, memoryId);
      assertActive();
      return persisted;
    }),
    [runWrite],
  );

  const discardMemory = React.useCallback(
    async (id: string) => runWrite(async (owner, assertActive) => {
      await discardMemoryInDb(db, id, new Date().toISOString(), owner);
      await refresh(owner, assertActive);
    }),
    [db, refresh, runWrite]
  );

  const deleteMemory = React.useCallback(
    async (id: string) => runWrite(async (owner, assertActive) => {
      await deleteMemoryFromDb(db, id, owner);
      await deleteMemoryPhotoDirectory(owner, id);
      await refresh(owner, assertActive);
    }),
    [db, refresh, runWrite]
  );

  const clearAllMemories = React.useCallback(async () => runWrite(async (owner, assertActive) => {
    await clearMemories(db, owner);
    await deleteAccountPhotoDirectoryStrict(owner);
    await refresh(owner, assertActive);
  }), [db, refresh, runWrite]);

  const listDiscarded = React.useCallback(async () => runWrite(async (owner, assertActive) => {
    const discarded = await Promise.all((await listDiscardedMemories(db, owner)).map((memory) => hydrateForRuntime(memory, owner)));
    assertActive();
    return discarded;
  }), [db, hydrateForRuntime, runWrite]);

  const restoreMemory = React.useCallback(
    async (id: string) => runWrite(async (owner, assertActive) => {
      await restoreDiscardedMemory(db, id, new Date().toISOString(), owner);
      await refresh(owner, assertActive);
    }),
    [db, refresh, runWrite]
  );

  const visibleMemories = React.useMemo(
    () => (memoriesOwner === accountKey && isLibraryReady ? memories : []),
    [accountKey, isLibraryReady, memories, memoriesOwner],
  );
  const visibleReady = isReady && memoriesOwner === accountKey && isLibraryReady;

  const value = React.useMemo<MemoriesContextValue>(
    () => ({
      memories: visibleMemories,
      isReady: visibleReady,
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
      getMemoryById: (id) => visibleMemories.find((memory) => memory.id === id),
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
      visibleReady,
      listDiscarded,
      visibleMemories,
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
