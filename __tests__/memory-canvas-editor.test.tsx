import {
  act,
  fireEvent,
  render,
} from "@testing-library/react-native";

import {
  addCanvasPage,
  addStickerToPage,
  addTextToPage,
  deleteCanvasPage,
  duplicateCanvasElement,
  moveCanvasPage,
  toggleCanvasPhotoSelection,
  updateCanvasElement,
} from "../src/features/canvas/editor-pages";
import type { Memory, StoryPage } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockUpdatePages = jest.fn();
const mockGetMemoryById = jest.fn();
const mockGetDraftById = jest.fn();
const mockGetMemoryEditDraft = jest.fn();
const mockSaveMemoryEditDraft = jest.fn();
const mockClearMemoryEditDraft = jest.fn();
const mockPersistSelectedPhoto = jest.fn();
const mockEmitDiagnostic = jest.fn();
const mockPageChangeCallbacks: Array<(pages: StoryPage[], reason: "text") => void> = [];
const mockTransformPendingCallbacks: Array<(pending: boolean) => void> = [];
let mockAccountEmail = "owner@example.com";
let mockRouteId = "memory-1";
let mockRoutePageId: string | undefined;
let mockRoutePageIndex: string | undefined;

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: mockRouteId, pageId: mockRoutePageId, pageIndex: mockRoutePageIndex }),
  useRouter: () => ({ back: mockBack, dismissTo: mockReplace }),
}));

jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { email: mockAccountEmail } }),
}));

jest.mock("../src/features/canvas/book-canvas-editor", () => {
  const React = require("react");
  const { Button, Text, View } = require("react-native");
  return { BookCanvasEditor: ({ initialPageId, onActivePageChange, onPagesChange, onTransformPendingChange, pages }: {
    initialPageId?: string;
    onActivePageChange?: (cursor: { pageId: string; index: number }) => void;
    onPagesChange: (pages: StoryPage[], reason: "text") => void;
    onTransformPendingChange?: (pending: boolean) => void;
    pages: StoryPage[];
  }) => {
    React.useEffect(() => {
      mockPageChangeCallbacks.push(onPagesChange);
      if (onTransformPendingChange) mockTransformPendingCallbacks.push(onTransformPendingChange);
    }, []);
    return (
      <View testID="album-canvas">
        <Text testID="current-headline">{pages.find((page) => page.id === initialPageId)?.headline ?? pages[0]?.headline}</Text>
        <Button title="report second page" onPress={() => onActivePageChange?.({ pageId: "page-2", index: 1 })} />
        <Button
          title="edit first page"
          onPress={() => onPagesChange(
            pages.map((page, index) => index === 0 ? { ...page, headline: "本地编辑" } : page),
            "text",
          )}
        />
        <Button
          title="edit latest page"
          onPress={() => onPagesChange(
            pages.map((page, index) => index === 0 ? { ...page, headline: "最新编辑" } : page),
            "text",
          )}
        />
      </View>
    );
  } };
});

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({
    clearMemoryEditDraft: mockClearMemoryEditDraft,
    getDraftById: mockGetDraftById,
    getMemoryById: mockGetMemoryById,
    getMemoryEditDraft: mockGetMemoryEditDraft,
    persistSelectedPhoto: mockPersistSelectedPhoto,
    saveMemoryEditDraft: mockSaveMemoryEditDraft,
    updatePages: mockUpdatePages,
  }),
}));

jest.mock("../src/features/diagnostics/local-diagnostics", () => ({
  localDiagnostics: { emit: (...args: unknown[]) => mockEmitDiagnostic(...args) },
}));

import EditMemoryScreen from "../src/app/memory/[id]/edit";

const legacyPages: StoryPage[] = [
  {
    id: "cover-1",
    position: 0,
    kind: "cover",
    headline: "杭州周末",
    body: "西湖边的一个下午。",
    photoUri: "file://west-lake.jpg",
  },
  {
    id: "closing-1",
    position: 1,
    kind: "closing",
    headline: "下次再见",
    body: "把这一页留给下一段旅程。",
  },
];

const memory: Memory = {
  id: "memory-1",
  title: "杭州周末",
  city: "hangzhou",
  travelDate: "2026-07-22",
  photoUris: ["file://west-lake.jpg", "file://coffee.jpg"],
  pages: legacyPages,
  createdAt: "2026-07-22T10:00:00.000Z",
  updatedAt: "2026-07-22T10:00:00.000Z",
};

describe("canvas page editing model", () => {
  it("adds a square photo page, deletes one page, and keeps positions contiguous when reordering", () => {
    const withNewPage = addCanvasPage(legacyPages, ["file://coffee.jpg", "file://bridge.jpg"], "page-3");
    const reordered = moveCanvasPage(withNewPage, "page-3", "backward");
    const remaining = deleteCanvasPage(reordered, "closing-1");

    expect(withNewPage[2].layout?.elements.filter((element) => element.type === "image")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: "file://coffee.jpg" }),
        expect.objectContaining({ uri: "file://bridge.jpg" }),
      ]),
    );
    const imageLayers = withNewPage[2].layout!.elements
      .filter((element) => element.type === "image")
      .map((element) => element.zIndex);
    const textLayers = withNewPage[2].layout!.elements
      .filter((element) => element.type === "text")
      .map((element) => element.zIndex);
    expect(Math.min(...textLayers)).toBeGreaterThan(Math.max(...imageLayers));
    expect(reordered.map((page) => page.id)).toEqual(["cover-1", "page-3", "closing-1"]);
    expect(remaining.map((page) => page.position)).toEqual([0, 1]);
  });

  it("keeps text and sticker edits in the selected page layout", () => {
    const withText = addTextToPage(legacyPages, "cover-1", "text-1");
    const withSticker = addStickerToPage(withText, "cover-1", "sticker-1", "sticker1-01");
    const updated = updateCanvasElement(withSticker, "cover-1", "text-1", { color: "#A44736" });
    const duplicated = duplicateCanvasElement(updated, "cover-1", "text-1", "text-2");

    expect(updated[0].layout?.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "text-1", color: "#A44736" })]),
    );
    expect(duplicated[0].layout?.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "sticker-1", stickerId: "sticker1-01" })]),
    );
    expect(duplicated[0].layout?.elements.find((element) => element.id === "text-2")).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("does not allow more than twelve source photos on one canvas page", () => {
    const selected = Array.from({ length: 12 }, (_, index) => `file://photo-${index}.jpg`);

    expect(toggleCanvasPhotoSelection(selected, "file://photo-12.jpg")).toEqual(selected);
  });
});

describe("EditMemoryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPageChangeCallbacks.length = 0;
    mockTransformPendingCallbacks.length = 0;
    mockAccountEmail = "owner@example.com";
    mockRouteId = "memory-1";
    mockRoutePageId = undefined;
    mockRoutePageIndex = undefined;
    mockGetMemoryById.mockReturnValue(memory);
    mockGetDraftById.mockResolvedValue(null);
    mockGetMemoryEditDraft.mockResolvedValue(null);
    mockSaveMemoryEditDraft.mockResolvedValue(undefined);
    mockClearMemoryEditDraft.mockResolvedValue(undefined);
    mockPersistSelectedPhoto.mockImplementation(async (_memoryId: string, uri: string) => uri);
    mockUpdatePages.mockResolvedValue(undefined);
  });

  it("restores a compatible recovery draft and announces it", async () => {
    const recoveredPages = legacyPages.map((page, index) => (
      index === 0 ? { ...page, headline: "恢复的编辑" } : page
    ));
    let resolveLookup: ((pages: StoryPage[]) => void) | undefined;
    mockGetMemoryEditDraft.mockReturnValue(new Promise<StoryPage[]>((resolve) => {
      resolveLookup = resolve;
    }));

    const screen = render(<EditMemoryScreen />);

    expect(screen.getByText("正在读取未保存的编辑…")).toBeTruthy();
    await act(async () => resolveLookup?.(recoveredPages));
    expect(await screen.findByTestId("current-headline")).toHaveTextContent("恢复的编辑");
    const status = screen.getByText("已恢复上次未保存的编辑");
    expect(status.props.role).toBe("status");
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("recovery_restored", {
      memoryId: "memory-1",
      source: "sqlite",
    });
  });

  it("uses formal album pages when there is no recovery draft", async () => {
    const screen = render(<EditMemoryScreen />);

    expect(await screen.findByTestId("current-headline")).toHaveTextContent("杭州周末");
  });

  it("does not reset local edits when the provider refreshes the memory identity", async () => {
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    await act(async () => fireEvent.press(screen.getByText("edit first page")));

    mockGetMemoryById.mockReturnValue({
      ...memory,
      pages: legacyPages.map((page, index) => (
        index === 0 ? { ...page, headline: "provider refresh" } : page
      )),
    });
    screen.rerender(<EditMemoryScreen />);

    expect(screen.getByTestId("current-headline")).toHaveTextContent("本地编辑");
    expect(mockGetMemoryEditDraft).toHaveBeenCalledTimes(1);
  });

  it("queues stable snapshots, coalesces to the latest edit, and restores it after remount", async () => {
    let recoveryDraft: StoryPage[] | null = null;
    let resolveFirstWrite: (() => void) | undefined;
    mockGetMemoryEditDraft.mockImplementation(async () => recoveryDraft);
    mockSaveMemoryEditDraft
      .mockImplementationOnce((_memory: Memory, pages: StoryPage[]) => new Promise<void>((resolve) => {
        resolveFirstWrite = () => {
          recoveryDraft = pages;
          resolve();
        };
      }))
      .mockImplementation(async (_memory: Memory, pages: StoryPage[]) => {
        recoveryDraft = pages;
      });
    const first = render(<EditMemoryScreen />);
    await first.findByTestId("album-canvas");

    fireEvent.press(first.getByText("edit first page"));
    fireEvent.press(first.getByText("edit latest page"));
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirstWrite?.());
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(2);
    expect(mockSaveMemoryEditDraft.mock.calls[1][1][0].headline).toBe("最新编辑");

    first.unmount();
    const second = render(<EditMemoryScreen />);
    expect(await second.findByTestId("current-headline")).toHaveTextContent("最新编辑");
  });

  it("drains already-enqueued recovery snapshots after the editor unmounts", async () => {
    let resolveFirstWrite: (() => void) | undefined;
    mockSaveMemoryEditDraft
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirstWrite = resolve; }))
      .mockResolvedValueOnce(undefined);
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("edit first page"));
    fireEvent.press(screen.getByText("edit latest page"));
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(1);
    const oldCallback = mockPageChangeCallbacks[0];
    screen.unmount();

    await act(async () => resolveFirstWrite?.());
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(2);
    expect(mockSaveMemoryEditDraft.mock.calls[1][0].id).toBe("memory-1");
    expect(mockSaveMemoryEditDraft.mock.calls[1][1][0].headline).toBe("最新编辑");
    await act(async () => oldCallback(
      legacyPages.map((page, index) => index === 0 ? { ...page, headline: "卸载后新增" } : page),
      "text",
    ));
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(2);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shares the recovery queue across remounts so the newest session snapshot wins", async () => {
    let recoveryDraft: StoryPage[] | null = null;
    let resolveFirstWrite: (() => void) | undefined;
    mockGetMemoryEditDraft.mockImplementation(async () => recoveryDraft);
    mockSaveMemoryEditDraft
      .mockImplementationOnce((_memory: Memory, pages: StoryPage[]) => new Promise<void>((resolve) => {
        resolveFirstWrite = () => {
          recoveryDraft = pages;
          resolve();
        };
      }))
      .mockImplementation(async (_memory: Memory, pages: StoryPage[]) => {
        recoveryDraft = pages;
      });
    const first = render(<EditMemoryScreen />);
    await first.findByTestId("album-canvas");
    fireEvent.press(first.getByText("edit first page"));
    fireEvent.press(first.getByText("edit latest page"));
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(1);
    first.unmount();

    const remounted = render(<EditMemoryScreen />);
    expect(await remounted.findByTestId("current-headline")).toHaveTextContent("最新编辑");
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("recovery_restored", {
      memoryId: "memory-1",
      source: "memory",
    });
    expect(mockGetMemoryEditDraft).toHaveBeenCalledTimes(1);
    const remountedCallback = mockPageChangeCallbacks.at(-1)!;
    await act(async () => remountedCallback(
      legacyPages.map((page, index) => index === 0 ? { ...page, headline: "跨重挂载最新 C" } : page),
      "text",
    ));
    await act(async () => resolveFirstWrite?.());

    expect(mockSaveMemoryEditDraft.mock.calls.map((call) => call[1][0].headline)).toEqual([
      "本地编辑",
      "跨重挂载最新 C",
    ]);
    expect(remounted.getByTestId("current-headline")).toHaveTextContent("跨重挂载最新 C");
    remounted.unmount();
    await act(async () => undefined);
    const restored = render(<EditMemoryScreen />);
    expect(await restored.findByTestId("current-headline")).toHaveTextContent("跨重挂载最新 C");
    expect(mockGetMemoryEditDraft).toHaveBeenCalledTimes(2);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("saves the latest queued snapshot after a same-key remount", async () => {
    let resolveFirstWrite: (() => void) | undefined;
    mockSaveMemoryEditDraft
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirstWrite = resolve; }))
      .mockResolvedValueOnce(undefined);
    const first = render(<EditMemoryScreen />);
    await first.findByTestId("album-canvas");
    fireEvent.press(first.getByText("edit first page"));
    fireEvent.press(first.getByText("edit latest page"));
    first.unmount();

    const remounted = render(<EditMemoryScreen />);
    expect(await remounted.findByTestId("current-headline")).toHaveTextContent("最新编辑");
    await act(async () => fireEvent.press(remounted.getByText("保存画布")));
    expect(mockUpdatePages).not.toHaveBeenCalled();
    await act(async () => resolveFirstWrite?.());

    expect(mockSaveMemoryEditDraft.mock.calls.map((call) => call[1][0].headline)).toEqual([
      "本地编辑",
      "最新编辑",
    ]);
    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockUpdatePages.mock.calls[0][1][0].headline).toBe("最新编辑");
    expect(mockClearMemoryEditDraft).toHaveBeenCalledWith("memory-1");
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("blocks editing after a recovery read failure and retries the same session", async () => {
    const recoveredPages = legacyPages.map((page, index) => (
      index === 0 ? { ...page, headline: "重试恢复" } : page
    ));
    mockGetMemoryEditDraft
      .mockRejectedValueOnce(new Error("database busy"))
      .mockResolvedValueOnce(recoveredPages);
    const screen = render(<EditMemoryScreen />);
    const retry = await screen.findByRole("button", {
      name: "读取未保存编辑失败，点击重试。",
    });

    expect(screen.queryByTestId("album-canvas")).toBeNull();
    expect(screen.queryByText("保存画布")).toBeNull();
    expect(mockUpdatePages).not.toHaveBeenCalled();
    expect(mockClearMemoryEditDraft).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(retry));

    expect(await screen.findByTestId("current-headline")).toHaveTextContent("重试恢复");
    expect(screen.getByText("已恢复上次未保存的编辑")).toBeTruthy();
    expect(mockGetMemoryEditDraft).toHaveBeenCalledTimes(2);
    expect(mockClearMemoryEditDraft).not.toHaveBeenCalled();
  });

  it("does not render or save an old fallback draft after account and route change", async () => {
    const draftA: Memory = {
      ...memory,
      id: "draft-a",
      pages: legacyPages.map((page, index) => (
        index === 0 ? { ...page, headline: "旧账号草稿" } : page
      )),
    };
    let rejectDraftB: ((reason?: unknown) => void) | undefined;
    mockGetMemoryById.mockReturnValue(undefined);
    mockGetDraftById
      .mockResolvedValueOnce(draftA)
      .mockReturnValueOnce(new Promise<Memory | null>((_resolve, reject) => { rejectDraftB = reject; }));
    const screen = render(<EditMemoryScreen />);
    expect(await screen.findByTestId("current-headline")).toHaveTextContent("旧账号草稿");

    mockAccountEmail = "other@example.com";
    mockRouteId = "draft-b";
    screen.rerender(<EditMemoryScreen />);
    expect(screen.queryByText("旧账号草稿")).toBeNull();
    expect(screen.getByText("正在读取可编辑的旅行册…")).toBeTruthy();
    await act(async () => rejectDraftB?.(new Error("lookup failed")));

    expect(screen.queryByTestId("album-canvas")).toBeNull();
    expect(screen.queryByText("保存画布")).toBeNull();
    expect(mockUpdatePages).not.toHaveBeenCalled();
    expect(mockGetDraftById).toHaveBeenLastCalledWith("draft-b");
  });

  it("clears a recovery-read error when a new memory session loads", async () => {
    const memoryB: Memory = {
      ...memory,
      id: "memory-2",
      pages: legacyPages.map((page, index) => (
        index === 0 ? { ...page, id: "cover-2", headline: "无旧错误的相册" } : { ...page, id: "closing-2" }
      )),
    };
    let providerMemory = memory;
    mockGetMemoryById.mockImplementation(() => providerMemory);
    mockGetMemoryEditDraft
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce(null);
    const screen = render(<EditMemoryScreen />);
    expect(await screen.findByRole("button", {
      name: "读取未保存编辑失败，点击重试。",
    })).toBeTruthy();

    mockRouteId = "memory-2";
    providerMemory = memoryB;
    screen.rerender(<EditMemoryScreen />);

    expect(await screen.findByTestId("current-headline")).toHaveTextContent("无旧错误的相册");
    expect(screen.queryByText("读取未保存编辑失败，点击重试。")).toBeNull();
  });

  it("clears a formal save error when a new memory session loads", async () => {
    const memoryB: Memory = {
      ...memory,
      id: "memory-2",
      pages: legacyPages.map((page, index) => (
        index === 0 ? { ...page, id: "cover-2", headline: "无保存错误的相册" } : { ...page, id: "closing-2" }
      )),
    };
    let providerMemory = memory;
    mockGetMemoryById.mockImplementation(() => providerMemory);
    mockUpdatePages.mockRejectedValueOnce(new Error("save failed"));
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    await act(async () => fireEvent.press(screen.getByText("保存画布")));
    expect(screen.getByText("保存失败，请稍后重试。")).toBeTruthy();

    mockRouteId = "memory-2";
    providerMemory = memoryB;
    screen.rerender(<EditMemoryScreen />);

    expect(await screen.findByTestId("current-headline")).toHaveTextContent("无保存错误的相册");
    expect(screen.queryByText("保存失败，请稍后重试。")).toBeNull();
  });

  it("waits for persistence before replacing the edit route with the active page", async () => {
    let resolveUpdate: (() => void) | undefined;
    mockUpdatePages.mockReturnValue(new Promise<void>((resolve) => { resolveUpdate = resolve; }));
    const screen = render(<EditMemoryScreen />);

    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("report second page"));
    await act(async () => fireEvent.press(screen.getByText("保存画布")));

    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => {
      resolveUpdate?.();
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/memory/[id]",
      params: { id: "memory-1", pageId: "page-2", pageIndex: "1" },
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("stays on the edit screen when persistence fails", async () => {
    mockUpdatePages.mockRejectedValue(new Error("save failed"));
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");

    await act(async () => {
      fireEvent.press(screen.getByText("保存画布"));
    });

    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    const errorMessage = screen.getByText("保存失败，请稍后重试。");
    expect(errorMessage.props.accessibilityRole).toBe("alert");
    expect(errorMessage.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByTestId("album-canvas")).toBeTruthy();
    expect(screen.getByText("保存画布")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("coalesces rapid save presses into one persistence operation and one navigation", async () => {
    let resolveUpdate: (() => void) | undefined;
    mockUpdatePages.mockReturnValue(new Promise<void>((resolve) => { resolveUpdate = resolve; }));
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    const saveButton = screen.getByText("保存画布");

    await act(async () => {
      fireEvent.press(saveButton);
      fireEvent.press(saveButton);
    });
    expect(mockUpdatePages).toHaveBeenCalledTimes(1);

    await act(async () => resolveUpdate?.());

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it.each(["resolve", "reject"])("does not navigate or update state after unmount when save %ss", async (outcome) => {
    let settle: (() => void) | undefined;
    mockUpdatePages.mockReturnValue(new Promise<void>((resolve, reject) => {
      settle = outcome === "resolve" ? resolve : () => reject(new Error("save failed"));
    }));
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");

    await act(async () => fireEvent.press(screen.getByText("保存画布")));
    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    screen.unmount();
    await act(async () => settle?.());

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("waits for recovery persistence, then formally saves, clears, and navigates in order", async () => {
    const order: string[] = [];
    let resolveRecovery: (() => void) | undefined;
    let resolveFormal: (() => void) | undefined;
    let resolveClear: (() => void) | undefined;
    mockSaveMemoryEditDraft.mockImplementation(() => new Promise<void>((resolve) => {
      resolveRecovery = () => { order.push("recovery"); resolve(); };
    }));
    mockUpdatePages.mockImplementation(() => new Promise<void>((resolve) => {
      order.push("formal-start");
      resolveFormal = () => { order.push("formal"); resolve(); };
    }));
    mockClearMemoryEditDraft.mockImplementation(() => new Promise<void>((resolve) => {
      order.push("clear-start");
      resolveClear = () => { order.push("clear"); resolve(); };
    }));
    mockReplace.mockImplementation(() => order.push("navigate"));
    mockEmitDiagnostic.mockImplementation((event: string) => order.push(`diagnostic:${event}`));
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("edit first page"));
    await act(async () => fireEvent.press(screen.getByText("保存画布")));

    expect(mockUpdatePages).not.toHaveBeenCalled();
    await act(async () => resolveRecovery?.());
    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockClearMemoryEditDraft).not.toHaveBeenCalled();
    await act(async () => resolveFormal?.());
    expect(mockClearMemoryEditDraft).toHaveBeenCalledWith("memory-1");
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => resolveClear?.());

    expect(order).toEqual([
      "diagnostic:formal_save_started",
      "recovery",
      "formal-start",
      "formal",
      "diagnostic:formal_persistence_succeeded",
      "clear-start",
      "clear",
      "diagnostic:recovery_clear_succeeded",
      "diagnostic:navigation_boundary",
      "navigate",
    ]);
    expect(JSON.stringify(mockEmitDiagnostic.mock.calls)).not.toMatch(/owner@example|file:\/\//u);
  });

  it("retains the recovery draft and does not clear or navigate when formal saving fails", async () => {
    mockUpdatePages.mockRejectedValue(new Error("formal failed"));
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("edit first page"));
    await act(async () => {
      fireEvent.press(screen.getByText("保存画布"));
    });

    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(1);
    expect(mockClearMemoryEditDraft).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("保存失败，请稍后重试。")).toBeTruthy();
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("formal_persistence_failed", {
      code: "write_failed",
      memoryId: "memory-1",
    });
  });

  it("keeps formal pages in memory when clearing fails and retries only the clear", async () => {
    let recoveryDraft: StoryPage[] | null = null;
    mockGetMemoryEditDraft.mockImplementation(async () => recoveryDraft);
    mockSaveMemoryEditDraft.mockImplementation(async (_memory: Memory, pages: StoryPage[]) => {
      recoveryDraft = pages;
    });
    mockClearMemoryEditDraft
      .mockRejectedValueOnce(new Error("clear failed"))
      .mockImplementationOnce(async () => { recoveryDraft = null; });
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("edit first page"));
    await act(async () => fireEvent.press(screen.getByText("保存画布")));

    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect((recoveryDraft as StoryPage[] | null)?.[0].headline).toBe("本地编辑");
    expect(screen.getByText("旅行册已保存，但未能清除恢复副本，请重试。")).toBeTruthy();
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("recovery_clear_failed", {
      code: "clear_failed",
      memoryId: "memory-1",
    });
    await act(async () => fireEvent.press(screen.getByText("保存画布")));

    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockClearMemoryEditDraft).toHaveBeenCalledTimes(2);
    expect(recoveryDraft).toBeNull();
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite an external formal update when retrying a failed clear", async () => {
    let providerMemory = memory;
    mockGetMemoryById.mockImplementation(() => providerMemory);
    mockClearMemoryEditDraft
      .mockRejectedValueOnce(new Error("clear failed"))
      .mockResolvedValueOnce(undefined);
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("edit first page"));
    await act(async () => fireEvent.press(screen.getByText("保存画布")));

    providerMemory = {
      ...memory,
      pages: legacyPages.map((page, index) => (
        index === 0 ? { ...page, headline: "外部更新" } : page
      )),
      updatedAt: "2026-07-22T11:00:00.000Z",
    };
    screen.rerender(<EditMemoryScreen />);
    await act(async () => fireEvent.press(screen.getByText("保存画布")));

    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(1);
    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockUpdatePages.mock.calls[0][1][0].headline).toBe("本地编辑");
    expect(mockClearMemoryEditDraft).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("ignores an old editor callback after an account session changes", async () => {
    let providerMemory = memory;
    mockGetMemoryById.mockImplementation(() => providerMemory);
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    const oldCallback = mockPageChangeCallbacks[0];

    mockAccountEmail = "other@example.com";
    providerMemory = {
      ...memory,
      pages: legacyPages.map((page, index) => (
        index === 0 ? { ...page, headline: "新账号相册" } : page
      )),
    };
    screen.rerender(<EditMemoryScreen />);
    await screen.findByText("新账号相册");
    await act(async () => oldCallback(
      legacyPages.map((page, index) => index === 0 ? { ...page, headline: "旧回调" } : page),
      "text",
    ));

    expect(screen.getByTestId("current-headline")).toHaveTextContent("新账号相册");
    expect(mockSaveMemoryEditDraft).not.toHaveBeenCalled();
  });

  it("ignores a captured editor callback after unmount", async () => {
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    const oldCallback = mockPageChangeCallbacks[0];
    screen.unmount();

    await act(async () => oldCallback(
      legacyPages.map((page, index) => index === 0 ? { ...page, headline: "卸载后回调" } : page),
      "text",
    ));

    expect(mockSaveMemoryEditDraft).not.toHaveBeenCalled();
  });

  it("invalidates a pending formal save when switching to another memory", async () => {
    const memoryB: Memory = {
      ...memory,
      id: "memory-2",
      pages: legacyPages.map((page, index) => (
        index === 0 ? { ...page, id: "cover-2", headline: "相册 B" } : { ...page, id: "closing-2" }
      )),
      updatedAt: "2026-07-22T12:00:00.000Z",
    };
    let providerMemory = memory;
    let resolveMemoryA: (() => void) | undefined;
    mockGetMemoryById.mockImplementation(() => providerMemory);
    mockUpdatePages
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveMemoryA = resolve; }))
      .mockResolvedValueOnce(undefined);
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    await act(async () => fireEvent.press(screen.getByText("保存画布")));
    expect(mockUpdatePages).toHaveBeenCalledTimes(1);

    mockRouteId = "memory-2";
    providerMemory = memoryB;
    screen.rerender(<EditMemoryScreen />);
    await screen.findByText("相册 B");
    const memoryBSave = screen.getByRole("button", { name: "保存画布" });
    expect(memoryBSave.props.accessibilityState.disabled).toBe(false);
    await act(async () => resolveMemoryA?.());

    expect(mockClearMemoryEditDraft).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存画布" }).props.accessibilityState.disabled).toBe(false);
    await act(async () => fireEvent.press(screen.getByText("保存画布")));
    expect(mockUpdatePages).toHaveBeenCalledTimes(2);
    expect(mockUpdatePages.mock.calls[1][0].id).toBe("memory-2");
    expect(mockClearMemoryEditDraft).toHaveBeenCalledWith("memory-2");
  });

  it("resets pending transform state when switching memories and ignores the old settle callback", async () => {
    const memoryB: Memory = {
      ...memory,
      id: "memory-2",
      pages: legacyPages.map((page, index) => (
        index === 0 ? { ...page, id: "cover-2", headline: "相册 B" } : { ...page, id: "closing-2" }
      )),
    };
    let providerMemory = memory;
    mockGetMemoryById.mockImplementation(() => providerMemory);
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    const oldTransformCallback = mockTransformPendingCallbacks[0];
    await act(async () => oldTransformCallback(true));
    expect(screen.getByRole("button", { name: "保存画布" }).props.accessibilityState.disabled).toBe(true);

    mockRouteId = "memory-2";
    providerMemory = memoryB;
    screen.rerender(<EditMemoryScreen />);
    await screen.findByText("相册 B");
    expect(screen.getByRole("button", { name: "保存画布" }).props.accessibilityState.disabled).toBe(false);
    await act(async () => oldTransformCallback(true));

    expect(screen.getByRole("button", { name: "保存画布" }).props.accessibilityState.disabled).toBe(false);
    await act(async () => fireEvent.press(screen.getByText("保存画布")));
    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockUpdatePages.mock.calls[0][0].id).toBe("memory-2");
  });

  it("locks late editor commits after the formal save snapshot is captured", async () => {
    let resolveFormal: (() => void) | undefined;
    let resolveClear: (() => void) | undefined;
    mockUpdatePages.mockReturnValue(new Promise<void>((resolve) => { resolveFormal = resolve; }));
    mockClearMemoryEditDraft.mockReturnValue(new Promise<void>((resolve) => { resolveClear = resolve; }));
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("edit first page"));
    await act(async () => undefined);
    const capturedCallback = mockPageChangeCallbacks[0];
    await act(async () => fireEvent.press(screen.getByText("保存画布")));

    await act(async () => capturedCallback(
      legacyPages.map((page, index) => index === 0 ? { ...page, headline: "保存中迟到" } : page),
      "text",
    ));
    await act(async () => resolveFormal?.());
    await act(async () => capturedCallback(
      legacyPages.map((page, index) => index === 0 ? { ...page, headline: "清理中迟到" } : page),
      "text",
    ));

    expect(mockUpdatePages.mock.calls[0][1][0].headline).toBe("本地编辑");
    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("current-headline")).toHaveTextContent("本地编辑");
    await act(async () => resolveClear?.());
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("uses explicit formal save when the recovery queue is in error", async () => {
    mockSaveMemoryEditDraft.mockRejectedValue(new Error("disk full"));
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("edit first page"));
    const warning = await screen.findByRole("button", {
      name: "未保存编辑的恢复副本写入失败，点击重试。",
    });

    await act(async () => fireEvent.press(screen.getByText("保存画布")));

    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockUpdatePages.mock.calls[0][1][0].headline).toBe("本地编辑");
    expect(mockClearMemoryEditDraft).toHaveBeenCalledWith("memory-1");
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(warning).toBeTruthy();
  });

  it("shows a persistent recovery warning and retries the latest snapshot", async () => {
    mockSaveMemoryEditDraft
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const screen = render(<EditMemoryScreen />);
    await screen.findByTestId("album-canvas");
    fireEvent.press(screen.getByText("edit first page"));

    const warning = await screen.findByRole("button", {
      name: "未保存编辑的恢复副本写入失败，点击重试。",
    });
    expect(warning.props.accessibilityRole).toBe("button");
    expect(warning.props.accessibilityLiveRegion).toBe("polite");
    fireEvent.press(warning);
    await act(async () => undefined);

    expect(mockSaveMemoryEditDraft).toHaveBeenCalledTimes(2);
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("recovery_write_failed", {
      code: "write_failed",
      memoryId: "memory-1",
    });
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("recovery_write_retried", {
      memoryId: "memory-1",
    });
    expect(screen.queryByText("未保存编辑的恢复副本写入失败，点击重试。")).toBeNull();
  });
});
