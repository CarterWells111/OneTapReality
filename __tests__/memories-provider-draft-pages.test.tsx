import { act, render, waitFor } from "@testing-library/react-native";

import type { Memory, StoryPage } from "../src/types/memory";

const mockDatabase = { name: "local" };
const mockListMemories = jest.fn();
const mockUpdateMemoryPages = jest.fn();
const mockPersistPhotoUriStrict = jest.fn();
const mockHydrateMemoryPhotoReferences = jest.fn();
const mockReplaceMemoryMediaSnapshot = jest.fn();

jest.mock("expo-sqlite", () => ({
  useSQLiteContext: () => mockDatabase,
}));
jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => ({ isAuthReady: true, user: { id: "user-1", email: "Owner@Example.com", isAdmin: false } }),
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

jest.mock("../src/storage/memory-repository", () => ({
  clearMemories: jest.fn(),
  claimUnownedMemories: jest.fn(async () => 0),
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
      "owner@example.com",
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
      "owner@example.com",
      "draft-1",
    );
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
    expect(mockReplaceMemoryMediaSnapshot).toHaveBeenCalledWith(mockDatabase, storageMemory, "owner@example.com");
  });
});
