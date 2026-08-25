import { act, render, waitFor } from "@testing-library/react-native";

const mockDatabase = { name: "local" };
const mockListMemories = jest.fn();
const mockUseAuth = jest.fn();
const mockGetMemoryEditDraft = jest.fn();
const mockSaveMemoryEditDraft = jest.fn();
const mockClearMemoryEditDraft = jest.fn();
const mockDeleteAccountPhotoDirectory = jest.fn();
const mockDeleteAccountPhotoDirectoryStrict = jest.fn();
const mockRunWrite = (operation: (requestedOwner: string, assertActive: () => void) => Promise<unknown>) => {
  const auth = mockUseAuth();
  const owner = auth.user ? `account:${auth.user.email.trim().toLowerCase()}` : "guest";
  return operation(owner, () => undefined);
};

jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/features/auth/local-library-provider", () => ({
  useLocalLibrary: () => {
    const auth = mockUseAuth();
    const owner = auth.user ? `account:${auth.user.email.trim().toLowerCase()}` : "guest";
    return {
      isReady: auth.isAuthReady,
      owner,
      runWrite: mockRunWrite,
    };
  },
}));
jest.mock("../src/features/memories/photo-persistence", () => ({
  cleanupMigratedLegacyPhotoUris: jest.fn(async () => undefined),
  deleteAccountPhotoDirectory: (...args: unknown[]) => mockDeleteAccountPhotoDirectory(...args),
  deleteAccountPhotoDirectoryStrict: (...args: unknown[]) => mockDeleteAccountPhotoDirectoryStrict(...args),
  deleteMemoryPhotoDirectory: jest.fn(async () => undefined),
  ensureMemoryPhotosPersisted: jest.fn(async (memory) => ({ memory, changed: false })),
  findMigratedLegacyPhotoUris: jest.fn(() => []),
  hydrateMemoryPhotoReferences: jest.fn(async (memory) => ({
    changed: false,
    runtimeMemory: memory,
    storageMemory: memory,
    unresolved: [],
  })),
  persistPhotoUriStrict: jest.fn(async (uri) => uri),
}));
jest.mock("../src/storage/memory-edit-draft-repository", () => ({
  clearMemoryEditDraft: (...args: unknown[]) => mockClearMemoryEditDraft(...args),
  getMemoryEditDraft: (...args: unknown[]) => mockGetMemoryEditDraft(...args),
  saveMemoryEditDraft: (...args: unknown[]) => mockSaveMemoryEditDraft(...args),
}));
jest.mock("../src/storage/memory-repository", () => ({
  clearMemories: jest.fn(),
  createDraft: jest.fn(),
  deleteMemory: jest.fn(),
  discardDraft: jest.fn(),
  discardMemory: jest.fn(),
  getDraft: jest.fn(),
  listDiscardedMemories: jest.fn(),
  listMemories: (...args: unknown[]) => mockListMemories(...args),
  restoreDiscardedMemory: jest.fn(),
  saveDraft: jest.fn(),
  saveMemory: jest.fn(),
  updateMemoryPages: jest.fn(),
  updateMemoryPhotos: jest.fn(),
}));

import { MemoriesProvider, useMemories } from "../src/features/memories/memories-provider";
import type { Memory, StoryPage } from "../src/types/memory";

let captured: ReturnType<typeof useMemories> | undefined;
function Capture() { captured = useMemories(); return null; }

describe("MemoriesProvider account gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    captured = undefined;
    mockListMemories.mockResolvedValue([]);
    mockDeleteAccountPhotoDirectory.mockResolvedValue(undefined);
    mockDeleteAccountPhotoDirectoryStrict.mockResolvedValue(undefined);
  });

  it("reads and manages the guest local library while signed out", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: null });
    render(<MemoriesProvider><Capture /></MemoriesProvider>);
    await waitFor(() => expect(captured?.isReady).toBe(true));

    expect(mockListMemories).toHaveBeenCalledWith(mockDatabase, "guest");
    await act(async () => {
      await expect(captured!.clearAllMemories()).resolves.toBeUndefined();
    });
  });

  it("reads only the explicit normalized account owner", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { id: "staging-user", email: " Owner@Example.COM ", isAdmin: false } });
    render(<MemoriesProvider><Capture /></MemoriesProvider>);

    await waitFor(() => expect(mockListMemories).toHaveBeenCalledWith(mockDatabase, "account:owner@example.com"));
  });

  it("fails closed when deleting the active local library photo directory fails", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: null });
    mockDeleteAccountPhotoDirectoryStrict.mockRejectedValueOnce(new Error("filesystem unavailable"));
    render(<MemoriesProvider><Capture /></MemoriesProvider>);
    await waitFor(() => expect(captured?.isReady).toBe(true));

    await expect(captured!.clearAllMemories()).rejects.toThrow("filesystem unavailable");
    expect(mockDeleteAccountPhotoDirectoryStrict).toHaveBeenCalledWith("guest");
  });

  it("ignores a stale account refresh after switching accounts", async () => {
    let resolveFirst: ((value: unknown[]) => void) | undefined;
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { id: "a", email: "a@example.com", isAdmin: false } });
    mockListMemories
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([{ id: "b-memory", pages: [], photoUris: [] }]);

    const screen = render(<MemoriesProvider><Capture /></MemoriesProvider>);
    await waitFor(() => expect(mockListMemories).toHaveBeenCalledWith(mockDatabase, "account:a@example.com"));

    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { id: "b", email: "b@example.com", isAdmin: false } });
    screen.rerender(<MemoriesProvider><Capture /></MemoriesProvider>);
    await waitFor(() => expect(captured?.memories).toEqual([expect.objectContaining({ id: "b-memory" })]));

    await act(async () => { resolveFirst?.([{ id: "a-memory", pages: [], photoUris: [] }]); });
    expect(captured?.memories).toEqual([expect.objectContaining({ id: "b-memory" })]);
  });

  it("scopes every recovery draft operation to the normalized current account", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { id: "owner", email: " Owner@Example.COM ", isAdmin: false } });
    mockGetMemoryEditDraft.mockResolvedValue([]);
    mockSaveMemoryEditDraft.mockResolvedValue(undefined);
    mockClearMemoryEditDraft.mockResolvedValue(undefined);
    const memory = {
      id: "memory-1",
      title: "Album",
      city: "hangzhou",
      travelDate: "2026-08-10",
      photoUris: [],
      pages: [],
      createdAt: "2026-08-10T10:00:00.000Z",
      updatedAt: "2026-08-10T11:00:00.000Z",
    } satisfies Memory;
    const pages: StoryPage[] = [{
      id: "page-1",
      position: 0,
      kind: "cover",
      headline: "Cover",
      body: "Body",
    }];

    render(<MemoriesProvider><Capture /></MemoriesProvider>);
    await waitFor(() => expect(captured?.isReady).toBe(true));

    await expect(captured!.getMemoryEditDraft(memory)).resolves.toEqual([]);
    await captured!.saveMemoryEditDraft(memory, pages);
    await captured!.clearMemoryEditDraft(memory.id);

    expect(mockGetMemoryEditDraft).toHaveBeenCalledWith(mockDatabase, memory, "account:owner@example.com");
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledWith(mockDatabase, memory, pages, "account:owner@example.com");
    expect(mockClearMemoryEditDraft).toHaveBeenCalledWith(mockDatabase, memory.id, "account:owner@example.com");
  });
});
