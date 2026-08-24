import { act, render, waitFor } from "@testing-library/react-native";

import type { Memory, StoryPage } from "../src/types/memory";

const mockDatabase = { name: "local" };
const mockListMemories = jest.fn();
const mockUpdateMemoryPages = jest.fn();
const mockPersistPhotoUriStrict = jest.fn();
const mockHydrateMemoryPhotoReferences = jest.fn();
const mockReplaceMemoryMediaSnapshot = jest.fn();
const mockGetMemoryEditDraft = jest.fn();
const mockSaveMemoryEditDraft = jest.fn();

jest.mock("expo-sqlite", () => ({
  useSQLiteContext: () => mockDatabase,
}));
jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => ({ isAuthReady: true, user: { id: "user-1", email: "Owner@Example.com", isAdmin: false } }),
}));
jest.mock("../src/features/auth/local-library-provider", () => ({
  useLocalLibrary: () => ({ isReady: true, owner: "account:owner@example.com" }),
}));
jest.mock("../src/features/memories/photo-persistence", () => ({
  cleanupMigratedLegacyPhotoUris: jest.fn(async () => undefined),
  deleteAccountPhotoDirectory: jest.fn(async () => undefined),
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
  getDraft: jest.fn(),
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
    mockUpdateMemoryPages.mockResolvedValue(undefined);
    mockGetMemoryEditDraft.mockResolvedValue(null);
    mockSaveMemoryEditDraft.mockResolvedValue(undefined);
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
});
