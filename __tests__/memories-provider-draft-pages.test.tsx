import { act, render, waitFor } from "@testing-library/react-native";

import type { Memory, StoryPage } from "../src/types/memory";

const mockDatabase = { name: "local" };
const mockListMemories = jest.fn();
const mockUpdateMemoryPages = jest.fn();

jest.mock("expo-sqlite", () => ({
  useSQLiteContext: () => mockDatabase,
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

    expect(mockUpdateMemoryPages).toHaveBeenCalledWith(
      mockDatabase,
      expect.objectContaining({ id: "draft-1", pages }),
    );
    expect(mockListMemories).toHaveBeenCalledTimes(1);
  });
});
