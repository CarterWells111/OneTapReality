import { act, render, waitFor } from "@testing-library/react-native";

const mockDatabase = { name: "local" };
const mockClaimUnownedMemories = jest.fn();
const mockListMemories = jest.fn();
const mockUseAuth = jest.fn();
const mockGetMemoryEditDraft = jest.fn();
const mockSaveMemoryEditDraft = jest.fn();
const mockClearMemoryEditDraft = jest.fn();

jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("../src/features/auth/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("../src/storage/memory-edit-draft-repository", () => ({
  clearMemoryEditDraft: (...args: unknown[]) => mockClearMemoryEditDraft(...args),
  getMemoryEditDraft: (...args: unknown[]) => mockGetMemoryEditDraft(...args),
  saveMemoryEditDraft: (...args: unknown[]) => mockSaveMemoryEditDraft(...args),
}));
jest.mock("../src/storage/memory-repository", () => ({
  claimUnownedMemories: (...args: unknown[]) => mockClaimUnownedMemories(...args),
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
    mockClaimUnownedMemories.mockResolvedValue(0);
    mockListMemories.mockResolvedValue([]);
  });

  it("does not read local albums while signed out and rejects writes", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: null });
    render(<MemoriesProvider><Capture /></MemoriesProvider>);
    await waitFor(() => expect(captured?.isReady).toBe(true));

    expect(mockListMemories).not.toHaveBeenCalled();
    await expect(captured!.clearAllMemories()).rejects.toThrow("请先登录");
  });

  it("claims legacy rows and reads only the normalized verified email", async () => {
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { id: "staging-user", email: " Owner@Example.COM ", isAdmin: false } });
    render(<MemoriesProvider><Capture /></MemoriesProvider>);

    await waitFor(() => expect(mockListMemories).toHaveBeenCalledWith(mockDatabase, "owner@example.com"));
    expect(mockClaimUnownedMemories).toHaveBeenCalledWith(mockDatabase, "owner@example.com");
  });

  it("ignores a stale account refresh after switching accounts", async () => {
    let resolveFirst: ((value: unknown[]) => void) | undefined;
    mockUseAuth.mockReturnValue({ isAuthReady: true, user: { id: "a", email: "a@example.com", isAdmin: false } });
    mockListMemories
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([{ id: "b-memory", pages: [], photoUris: [] }]);

    const screen = render(<MemoriesProvider><Capture /></MemoriesProvider>);
    await waitFor(() => expect(mockListMemories).toHaveBeenCalledWith(mockDatabase, "a@example.com"));

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

    expect(mockGetMemoryEditDraft).toHaveBeenCalledWith(mockDatabase, memory, "owner@example.com");
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledWith(mockDatabase, memory, pages, "owner@example.com");
    expect(mockClearMemoryEditDraft).toHaveBeenCalledWith(mockDatabase, memory.id, "owner@example.com");
  });
});
