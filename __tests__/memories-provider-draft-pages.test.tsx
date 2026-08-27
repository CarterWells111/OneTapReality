import { act, render, waitFor } from "@testing-library/react-native";

import type { CanvasImageElement, Memory, StoryPage } from "../src/types/memory";

const mockDatabase = { name: "local" };
const mockListMemories = jest.fn();
const mockGetDraft = jest.fn();
const mockUpdateMemoryPages = jest.fn();
const mockPersistPhotoUriStrict = jest.fn();
const mockHydrateMemoryPhotoReferences = jest.fn();
const mockReplaceMemoryMediaSnapshot = jest.fn();
const mockGetMemoryEditDraft = jest.fn();
const mockSaveMemoryEditDraft = jest.fn();
const mockRunWrite = (operation: (owner: string, assertActive: () => void) => Promise<unknown>) => (
  operation("account:owner@example.com", () => undefined)
);
const mockGenerate = jest.fn();

jest.mock("expo-sqlite", () => ({
  useSQLiteContext: () => mockDatabase,
}));
jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => ({ isAuthReady: true, user: { id: "user-1", email: "Owner@Example.com", isAdmin: false } }),
}));
jest.mock("../src/features/auth/local-library-provider", () => ({
  useLocalLibrary: () => ({
    isReady: true,
    owner: "account:owner@example.com",
    runWrite: mockRunWrite,
  }),
}));
jest.mock("../src/services/ai/demo-draft-generator", () => ({
  DemoDraftGenerator: jest.fn().mockImplementation(() => ({
    generate: (...args: unknown[]) => mockGenerate(...args),
  })),
}));
jest.mock("../src/features/memories/photo-persistence", () => ({
  cleanupMigratedLegacyPhotoUris: jest.fn(async () => undefined),
  deleteAccountPhotoDirectory: jest.fn(async () => undefined),
  deleteAccountPhotoDirectoryStrict: jest.fn(async () => undefined),
  deleteMemoryPhotoDirectory: jest.fn(async () => undefined),
  ensureMemoryPhotosPersisted: jest.fn(async (memory) => ({ memory, changed: false })),
  findMigratedLegacyPhotoUris: jest.fn(() => []),
  hydrateMemoryPhotoReferences: (...args: unknown[]) => mockHydrateMemoryPhotoReferences(...args),
  persistPhotoUriStrict: (...args: unknown[]) => mockPersistPhotoUriStrict(...args),
}));

jest.mock("../src/storage/memory-edit-draft-repository", () => ({
  clearMemoryEditDraft: jest.fn(),
  getMemoryEditDraft: (...args: unknown[]) => mockGetMemoryEditDraft(...args),
  saveMemoryEditDraft: (...args: unknown[]) => mockSaveMemoryEditDraft(...args),
}));

jest.mock("../src/storage/memory-repository", () => ({
  clearMemories: jest.fn(),
  createDraft: jest.fn(),
  deleteMemory: jest.fn(),
  discardDraft: jest.fn(),
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
  listDiscardedMemories: jest.fn(),
  listMemories: (...args: unknown[]) => mockListMemories(...args),
  restoreDiscardedMemory: jest.fn(),
  saveDraft: jest.fn(),
  saveMemory: jest.fn(),
  replaceMemoryMediaSnapshot: (...args: unknown[]) => mockReplaceMemoryMediaSnapshot(...args),
  updateMemoryPages: (...args: unknown[]) => mockUpdateMemoryPages(...args),
}));

import {
  MemoriesProvider,
  reconstructDraftPagePlans,
  useMemories,
} from "../src/features/memories/memories-provider";

let capturedMemories: ReturnType<typeof useMemories> | undefined;

function CaptureMemories() {
  capturedMemories = useMemories();
  return null;
}

const pages: StoryPage[] = [{
  id: "page-1",
  position: 0,
  kind: "cover",
  headline: "草稿页",
  body: "本地内容",
}];

const draft: Memory = {
  id: "draft-1",
  title: "草稿",
  city: "hangzhou",
  travelDate: "2026-07-23",
  photoUris: [],
  pages,
  createdAt: "2026-07-23T10:00:00.000Z",
  updatedAt: "2026-07-23T10:00:00.000Z",
  status: "draft",
};

describe("MemoriesProvider draft page persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedMemories = undefined;
    mockListMemories.mockResolvedValue([]);
    mockHydrateMemoryPhotoReferences.mockImplementation(async (memory) => ({
      runtimeMemory: memory,
      storageMemory: memory,
      changed: false,
      unresolved: [],
    }));
    mockReplaceMemoryMediaSnapshot.mockResolvedValue(true);
    mockGetDraft.mockResolvedValue(null);
    mockGenerate.mockResolvedValue([]);
    mockUpdateMemoryPages.mockResolvedValue(undefined);
    mockGetMemoryEditDraft.mockResolvedValue(null);
    mockSaveMemoryEditDraft.mockResolvedValue(undefined);
  });

  it("reconstructs grouped photo plans from persisted layout image z-order", () => {
    const image = (id: string, uri: string, zIndex: number): CanvasImageElement => ({
      id,
      type: "image",
      uri,
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
      rotation: 0,
      zIndex,
    });
    const persisted: Memory = {
      id: "draft-1",
      title: "模板草稿",
      city: "hangzhou",
      travelDate: "2026-07-23",
      photoUris: ["file://one.jpg", "file://two.jpg", "file://three.jpg"],
      pages: [
        { id: "draft-1:cover", position: 0, kind: "cover", headline: "封面", body: "开始" },
        {
          id: "draft-1:photo-1",
          position: 1,
          kind: "photo",
          headline: "照片",
          body: "两张",
          photoUri: "file://one.jpg",
          layout: {
            aspectRatio: 0.75,
            photoTemplateId: "classic-2",
            elements: [image("image-2", "file://two.jpg", 8), image("image-1", "file://one.jpg", 3)],
          },
        },
        {
          id: "draft-1:photo-2",
          position: 2,
          kind: "photo",
          headline: "照片",
          body: "一张",
          photoUri: "file://three.jpg",
          layout: {
            aspectRatio: 0.75,
            photoTemplateId: "story-1",
            elements: [image("image-1", "file://three.jpg", 1)],
          },
        },
        { id: "draft-1:closing", position: 3, kind: "closing", headline: "结束", body: "再见" },
      ],
      createdAt: "2026-07-23T10:00:00.000Z",
      updatedAt: "2026-07-23T10:00:00.000Z",
      status: "draft",
    };

    expect(reconstructDraftPagePlans(persisted)).toEqual([
      { photoUris: ["file://one.jpg", "file://two.jpg"], photoTemplateId: "classic-2" },
      { photoUris: ["file://three.jpg"], photoTemplateId: "story-1" },
    ]);
  });

  it("does not reconstruct legacy one-photo pages without planned layout markers", () => {
    expect(reconstructDraftPagePlans({ ...draft, pages: [{ ...pages[0], kind: "photo", photoUri: "file://legacy.jpg" }] })).toBeUndefined();
  });

  it("updates draft pages without refreshing the saved-memory list", async () => {
    render(
      <MemoriesProvider>
        <CaptureMemories />
      </MemoriesProvider>,
    );
    await waitFor(() => expect(capturedMemories?.isReady).toBe(true));

    await act(async () => {
      await capturedMemories!.updateDraftPages(draft, pages);
    });

    expect(mockReplaceMemoryMediaSnapshot).toHaveBeenCalledWith(
      mockDatabase,
      expect.objectContaining({ id: "draft-1", pages }),
      "account:owner@example.com",
    );
    expect(mockListMemories).toHaveBeenCalledTimes(1);
  });

  it("strictly persists a selected photo in the current account and memory directory", async () => {
    mockPersistPhotoUriStrict.mockResolvedValue("file:///documents/account/draft-1/photo.jpg");
    render(
      <MemoriesProvider>
        <CaptureMemories />
      </MemoriesProvider>,
    );
    await waitFor(() => expect(capturedMemories?.isReady).toBe(true));

    await expect(capturedMemories!.persistSelectedPhoto("draft-1", "file:///temporary.jpg"))
      .resolves.toBe("file:///documents/account/draft-1/photo.jpg");
    expect(mockPersistPhotoUriStrict).toHaveBeenCalledWith(
      "file:///temporary.jpg",
      "account:owner@example.com",
      "draft-1",
    );
  });

  it("rejects a page save when the owned media snapshot cannot be replaced", async () => {
    mockReplaceMemoryMediaSnapshot.mockResolvedValueOnce(false);
    render(<MemoriesProvider><CaptureMemories /></MemoriesProvider>);
    await waitFor(() => expect(capturedMemories?.isReady).toBe(true));

    await expect(capturedMemories!.updateDraftPages(draft, pages))
      .rejects.toThrow("no longer belongs");
  });

  it("does not mistake ordinary text for a missing local photo token", async () => {
    render(<MemoriesProvider><CaptureMemories /></MemoriesProvider>);
    await waitFor(() => expect(capturedMemories?.isReady).toBe(true));

    await expect(capturedMemories!.updateDraftPages(draft, [{
      ...pages[0],
      body: "missing-local-photo://this-is-copy",
    }])).resolves.toBeUndefined();
  });

  it("stores recovery draft pages as canonical photo references", async () => {
    const runtimeUri = "file:///current/Documents/photos/accounts/owner%40example.com/draft-1/photo.jpg";
    const storageUri = "documents://photos/accounts/owner%40example.com/draft-1/photo.jpg";
    const recoveryPages = [{ ...pages[0], photoUri: runtimeUri }];
    mockHydrateMemoryPhotoReferences.mockResolvedValueOnce({
      runtimeMemory: { ...draft, pages: recoveryPages },
      storageMemory: { ...draft, pages: [{ ...pages[0], photoUri: storageUri }] },
      changed: true,
      unresolved: [],
    });
    render(<MemoriesProvider><CaptureMemories /></MemoriesProvider>);
    await waitFor(() => expect(capturedMemories?.isReady).toBe(true));

    await capturedMemories!.saveMemoryEditDraft(draft, recoveryPages);

    expect(mockSaveMemoryEditDraft).toHaveBeenCalledWith(
      mockDatabase,
      draft,
      [{ ...pages[0], photoUri: storageUri }],
      "account:owner@example.com",
    );
  });

  it("hydrates recovery draft pages before returning them to the editor", async () => {
    const storageUri = "documents://photos/accounts/owner%40example.com/draft-1/photo.jpg";
    const runtimeUri = "file:///current/Documents/photos/accounts/owner%40example.com/draft-1/photo.jpg";
    const storedPages = [{ ...pages[0], photoUri: storageUri }];
    const runtimePages = [{ ...pages[0], photoUri: runtimeUri }];
    mockGetMemoryEditDraft.mockResolvedValueOnce(storedPages);
    mockHydrateMemoryPhotoReferences.mockResolvedValueOnce({
      runtimeMemory: { ...draft, pages: runtimePages },
      storageMemory: { ...draft, pages: storedPages },
      changed: false,
      unresolved: [],
    });
    render(<MemoriesProvider><CaptureMemories /></MemoriesProvider>);
    await waitFor(() => expect(capturedMemories?.isReady).toBe(true));

    await expect(capturedMemories!.getMemoryEditDraft(draft)).resolves.toEqual(runtimePages);
  });

  it("hydrates storage references before exposing them and atomically writes a changed media snapshot", async () => {
    const storageMemory = { ...draft, id: "saved-1", status: "saved" as const, photoUris: ["documents://photos/accounts/owner%40example.com/saved-1/1-photo.jpg"] };
    const runtimeMemory = { ...storageMemory, photoUris: ["file:///current/Documents/photos/accounts/owner%40example.com/saved-1/1-photo.jpg"] };
    mockListMemories.mockResolvedValueOnce([storageMemory]);
    mockHydrateMemoryPhotoReferences.mockResolvedValueOnce({
      runtimeMemory,
      storageMemory,
      changed: true,
      unresolved: [],
    });

    render(<MemoriesProvider><CaptureMemories /></MemoriesProvider>);

    await waitFor(() => expect(capturedMemories?.isReady).toBe(true));
    expect(capturedMemories?.memories).toEqual([runtimeMemory]);
    expect(mockReplaceMemoryMediaSnapshot).toHaveBeenCalledWith(mockDatabase, storageMemory, "account:owner@example.com");
  });

  it("passes reconstructed grouped plans into draft retry without persisting them", async () => {
    const persistedDraft: Memory = {
      id: "draft-1",
      title: "模板草稿",
      city: "hangzhou",
      travelDate: "2026-07-23",
      photoUris: ["file://one.jpg", "file://two.jpg", "file://three.jpg"],
      pages: [
        { ...pages[0], id: "draft-1:cover", position: 0 },
        {
          id: "draft-1:photo-1",
          position: 1,
          kind: "photo",
          headline: "照片",
          body: "两张",
          photoUri: "file://one.jpg",
          layout: {
            aspectRatio: 0.75,
            photoTemplateId: "classic-2",
            elements: [
              { id: "image-2", type: "image", uri: "file://two.jpg", x: 0.1, y: 0.5, width: 0.8, height: 0.4, rotation: 0, zIndex: 2 },
              { id: "image-1", type: "image", uri: "file://one.jpg", x: 0.1, y: 0.1, width: 0.8, height: 0.4, rotation: 0, zIndex: 1 },
            ],
          },
        },
        {
          id: "draft-1:photo-2",
          position: 2,
          kind: "photo",
          headline: "照片",
          body: "一张",
          photoUri: "file://three.jpg",
          layout: {
            aspectRatio: 0.75,
            photoTemplateId: "story-1",
            elements: [{ id: "image-1", type: "image", uri: "file://three.jpg", x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0, zIndex: 1 }],
          },
        },
        { id: "draft-1:closing", position: 3, kind: "closing", headline: "结束", body: "再见" },
      ],
      createdAt: "2026-07-23T10:00:00.000Z",
      updatedAt: "2026-07-23T10:00:00.000Z",
      status: "draft",
    };
    mockGetDraft.mockResolvedValue(persistedDraft);
    mockGenerate.mockResolvedValue([{ id: "cover", position: 0, kind: "cover", headline: "重试", body: "重试" }]);

    render(
      <MemoriesProvider>
        <CaptureMemories />
      </MemoriesProvider>,
    );
    await waitFor(() => expect(capturedMemories?.isReady).toBe(true));

    await act(async () => {
      await capturedMemories!.retryDraft("draft-1");
    });

    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
      pagePlans: [
        { photoUris: ["file://one.jpg", "file://two.jpg"], photoTemplateId: "classic-2" },
        { photoUris: ["file://three.jpg"], photoTemplateId: "story-1" },
      ],
    }));
    expect(mockReplaceMemoryMediaSnapshot).toHaveBeenCalledWith(
      mockDatabase,
      expect.not.objectContaining({ pagePlans: expect.anything() }),
      "account:owner@example.com",
    );
  });
});
