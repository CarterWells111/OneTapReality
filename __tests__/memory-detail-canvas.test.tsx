import { act, fireEvent, render, within } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { Alert, Modal, ScrollView, StyleSheet, type AlertButton } from "react-native";

const mockGetMemoryById = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDiscardMemory = jest.fn();
const mockShare = jest.fn();
const mockPageReader = jest.fn();
let mockSearchParams: { id: string; pageId?: string | string[]; pageIndex?: string | string[] } = { id: "memory-canvas" };

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

jest.mock("expo-router", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Stack: {
      Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => (
        <View testID="memory-detail-header">{options?.headerRight ? options.headerRight() : null}</View>
      ),
    },
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
  };
});

jest.mock("../src/features/canvas/page-reader", () => {
  const React = require("react");
  const actual = jest.requireActual("../src/features/canvas/page-reader");
  return {
    ...actual,
    PageReader: (props: unknown) => {
      mockPageReader(props);
      return React.createElement(actual.PageReader, props);
    },
  };
});

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ discardMemory: mockDiscardMemory, getMemoryById: mockGetMemoryById }),
}));

jest.mock("../src/features/export/share-action-sheet", () => ({ showShareActionSheet: (...args: unknown[]) => mockShare(...args) }));

import MemoryDetailScreen from "../src/app/memory/[id]";

describe("MemoryDetailScreen canvas rendering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscardMemory.mockResolvedValue(undefined);
    mockSearchParams = { id: "memory-canvas" };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("renders saved canvas layouts and keeps the page heading available", async () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas",
      title: "上海之夜",
      city: "shanghai",
      travelDate: "2026-07-22",
      photoUris: ["file://bund.jpg"],
      createdAt: "2026-07-22T10:00:00.000Z",
      updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [
        {
          id: "cover",
          position: 0,
          kind: "cover",
          headline: "外滩的风",
          body: "我们散步到很晚。",
          layout: {
            aspectRatio: 1,
            elements: [
              { id: "title", type: "text", text: "外滩的风", fontStyle: "avenir", color: "#1C2C28", x: 0.1, y: 0.2, width: 0.8, height: 0.1, rotation: 0.25, zIndex: 1 },
            ],
          },
        },
      ],
    });

    const screen = await render(<MemoryDetailScreen />);

    expect(screen.getByText("上海之夜")).toBeTruthy();
    expect(screen.getByTestId("album-canvas")).toBeTruthy();
    expect(screen.getByText("外滩的风")).toBeTruthy();
    const canvasStyle = StyleSheet.flatten(screen.getByTestId("album-canvas").props.style);
    expect(canvasStyle.height / canvasStyle.width).toBeCloseTo(4 / 3);
    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-frame-title").props.style)).toMatchObject({
      transform: [{ rotate: "0.25rad" }],
    });
    expect(mockPageReader).toHaveBeenCalledWith(expect.objectContaining({ pages: expect.any(Array) }));
  });

  it.each([
    [{ id: "memory-canvas", pageId: "page-2", pageIndex: "1" }, "page-2", 1],
    [{ id: "memory-canvas", pageId: "missing", pageIndex: "-1" }, "missing", 0],
    [{ id: "memory-canvas", pageIndex: "Infinity" }, undefined, 0],
    [{ id: "memory-canvas", pageIndex: "1.5" }, undefined, 0],
    [{ id: "memory-canvas", pageIndex: ["1"] }, undefined, 0],
    [{ id: "memory-canvas", pageIndex: "0x10" }, undefined, 0],
    [{ id: "memory-canvas", pageIndex: "1e2" }, undefined, 0],
    [{ id: "memory-canvas", pageIndex: "9007199254740992" }, undefined, 0],
    [{ id: "memory-canvas", pageId: ["page-2"], pageIndex: "1" }, undefined, 1],
  ])("passes defensive restoration params to the page reader", (params, initialPageId, fallbackIndex) => {
    mockSearchParams = params;
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [{ id: "cover", position: 0, kind: "cover", headline: "Cover", body: "" }],
    });

    render(<MemoryDetailScreen />);

    expect(mockPageReader).toHaveBeenCalledWith(expect.objectContaining({ initialPageId, fallbackIndex }));
  });

  it("keeps edit and share in the header and places local actions after the reader", () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [{ id: "cover", position: 0, kind: "cover", headline: "Cover", body: "", layout: { aspectRatio: 0.75, elements: [] } }],
    });
    const view = render(<MemoryDetailScreen />);
    const body = within(view.UNSAFE_getByType(ScrollView));
    const header = within(view.getByTestId("memory-detail-header"));

    expect(header.getByLabelText("分享这册旅行记忆")).toBeTruthy();
    expect(header.getByLabelText("编辑旅行册")).toBeTruthy();
    expect(header.queryByLabelText("删除这册旅行记忆")).toBeNull();
    expect(body.queryByLabelText("分享这册旅行记忆")).toBeNull();
    expect(body.queryByLabelText("编辑旅行册")).toBeNull();
    expect(body.queryByLabelText("删除这册旅行记忆")).toBeNull();
    expect(body.queryByText("编辑相册")).toBeNull();
    expect(body.queryByText("分享相册")).toBeNull();

    fireEvent.press(header.getByLabelText("编辑旅行册"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/memory/[id]/edit",
      params: { id: "memory-canvas", pageId: "cover", pageIndex: "0" },
    });
    fireEvent.press(header.getByLabelText("分享这册旅行记忆"));
    expect(mockShare).toHaveBeenCalled();

    const orderedTestIds = view.getAllByTestId(/.*/)
      .map((instance) => instance.props.testID as string);
    const readerIndex = orderedTestIds.indexOf("reader-page");
    const actionsIndex = orderedTestIds.indexOf("memory-detail-actions");
    expect(readerIndex).toBeGreaterThanOrEqual(0);
    expect(actionsIndex).toBeGreaterThanOrEqual(0);
    expect(readerIndex).toBeLessThan(actionsIndex);
    expect(view.getByTestId("memory-detail-actions")).toHaveTextContent(/^页面预览绑定到礼品$/);

    fireEvent.press(view.getByText("绑定到礼品"));
    expect(mockPush).toHaveBeenCalledWith("/gifts?memoryId=memory-canvas");
  });

  it("previews saved album pages without edit controls and opens the selected page", () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [
        { id: "cover", position: 0, kind: "cover", headline: "Cover", body: "" },
        { id: "page-2", position: 1, kind: "photo", headline: "Second page", body: "" },
      ],
    });
    const view = render(<MemoryDetailScreen />);

    fireEvent.press(view.getByText("页面预览"));

    expect(view.getByText("页面预览 · 2 页")).toBeTruthy();
    expect(view.queryByLabelText("添加页面")).toBeNull();
    expect(view.queryByLabelText("删除所选页面")).toBeNull();

    fireEvent.press(view.getByLabelText("打开第 2 页"));

    expect(view.queryByText("页面预览 · 2 页")).toBeNull();
    expect(mockPageReader).toHaveBeenLastCalledWith(expect.objectContaining({
      fallbackIndex: 1,
      initialPageId: "page-2",
    }));
  });

  it("places only page preview and create actions after the sample reader", () => {
    mockSearchParams = { id: "sample-hangzhou" };

    const view = render(<MemoryDetailScreen />);
    const body = within(view.UNSAFE_getByType(ScrollView));
    const header = within(view.getByTestId("memory-detail-header"));

    expect(header.queryByLabelText("分享这册旅行记忆")).toBeNull();
    expect(header.queryByLabelText("编辑旅行册")).toBeNull();
    expect(header.queryByLabelText("删除这册旅行记忆")).toBeNull();
    expect(body.queryByLabelText("分享这册旅行记忆")).toBeNull();
    expect(body.queryByLabelText("编辑旅行册")).toBeNull();
    expect(body.queryByLabelText("删除这册旅行记忆")).toBeNull();
    expect(body.queryByText("编辑相册")).toBeNull();
    expect(body.queryByText("分享相册")).toBeNull();
    expect(body.queryByText("绑定到礼品")).toBeNull();

    const orderedTestIds = view.getAllByTestId(/.*/)
      .map((instance) => instance.props.testID as string);
    const readerIndex = orderedTestIds.indexOf("reader-page");
    const actionsIndex = orderedTestIds.indexOf("memory-detail-actions");
    expect(readerIndex).toBeGreaterThanOrEqual(0);
    expect(actionsIndex).toBeGreaterThanOrEqual(0);
    expect(readerIndex).toBeLessThan(actionsIndex);
    expect(view.getByTestId("memory-detail-actions")).toHaveTextContent(/^页面预览用自己的照片创建$/);

    fireEvent.press(view.getByText("页面预览"));
    const preview = within(view.UNSAFE_getByType(Modal));
    expect(preview.queryByLabelText("删除这册旅行记忆")).toBeNull();
  });

  it("keeps preview open on delete cancellation and discards only after destructive confirmation", async () => {
    let alertButtons: AlertButton[] | undefined;
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      alertButtons = buttons;
    });
    let resolveDiscard: (() => void) | undefined;
    mockDiscardMemory.mockImplementation(() => new Promise<void>((resolve) => {
      resolveDiscard = resolve;
    }));
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [{ id: "cover", position: 0, kind: "cover", headline: "Cover", body: "" }],
    });
    const view = render(<MemoryDetailScreen />);

    fireEvent.press(view.getByText("页面预览"));
    const preview = within(view.UNSAFE_getByType(Modal));
    fireEvent.press(preview.getByLabelText("删除这册旅行记忆"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "删除这册旅行记忆？",
      "会移入回收站，可在回收站里恢复或彻底删除。",
      expect.any(Array),
    );
    expect(mockDiscardMemory).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(view.getByText("页面预览 · 1 页")).toBeTruthy();

    const cancelButton = alertButtons?.find((button) => button.style === "cancel");
    expect(cancelButton?.text).toBe("取消");
    await act(async () => {
      cancelButton?.onPress?.();
      await Promise.resolve();
    });

    expect(mockDiscardMemory).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(view.getByText("页面预览 · 1 页")).toBeTruthy();

    fireEvent.press(preview.getByLabelText("删除这册旅行记忆"));
    const destructiveButton = alertButtons?.find((button) => button.style === "destructive");
    expect(destructiveButton?.text).toBe("删除");
    await act(async () => {
      destructiveButton?.onPress?.();
      await Promise.resolve();
    });

    expect(mockDiscardMemory).toHaveBeenCalledWith("memory-canvas");
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      resolveDiscard?.();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("keeps preview open and reports an error when album deletion fails", async () => {
    const alerts: Array<{ buttons?: AlertButton[]; message?: string; title: string }> = [];
    jest.spyOn(Alert, "alert").mockImplementation((title, message, buttons) => {
      alerts.push({ buttons, message, title });
    });
    let rejectDiscard: ((reason?: unknown) => void) | undefined;
    const discardPromise = new Promise<void>((_resolve, reject) => {
      rejectDiscard = reject;
    });
    let deletionChain: Promise<unknown> | undefined;
    const originalThen = discardPromise.then.bind(discardPromise);
    jest.spyOn(discardPromise, "then").mockImplementation(function <TResult1 = void, TResult2 = never>(
      onFulfilled?: ((value: void) => PromiseLike<TResult1> | TResult1) | null,
      onRejected?: ((reason: unknown) => PromiseLike<TResult2> | TResult2) | null,
    ) {
      const chain = originalThen(onFulfilled, onRejected);
      deletionChain = chain;
      return chain;
    });
    mockDiscardMemory.mockReturnValue(discardPromise);
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [{ id: "cover", position: 0, kind: "cover", headline: "Cover", body: "" }],
    });
    const view = render(<MemoryDetailScreen />);

    fireEvent.press(view.getByText("页面预览"));
    const preview = within(view.UNSAFE_getByType(Modal));
    fireEvent.press(preview.getByLabelText("删除这册旅行记忆"));

    expect(alerts[0]).toMatchObject({
      message: "会移入回收站，可在回收站里恢复或彻底删除。",
      title: "删除这册旅行记忆？",
    });
    const destructiveButton = alerts[0]?.buttons?.find((button) => button.style === "destructive");
    expect(destructiveButton?.text).toBe("删除");

    await act(async () => {
      destructiveButton?.onPress?.();
      expect(mockDiscardMemory).toHaveBeenCalledWith("memory-canvas");
      expect(mockReplace).not.toHaveBeenCalled();
      expect(view.getByText("页面预览 · 1 页")).toBeTruthy();
      rejectDiscard?.(new Error("discard failed"));
      await deletionChain?.catch(() => undefined);
      await Promise.resolve();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(view.getByText("页面预览 · 1 页")).toBeTruthy();
    expect(Alert.alert).toHaveBeenNthCalledWith(
      2,
      "删除失败",
      "未能移入回收站，请稍后重试。",
    );
  });

  it("issues a new restoration request when the same preview page is selected again", () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [
        { id: "cover", position: 0, kind: "cover", headline: "Cover", body: "" },
        { id: "page-2", position: 1, kind: "photo", headline: "Second page", body: "" },
      ],
    });
    const view = render(<MemoryDetailScreen />);

    fireEvent.press(view.getByText("页面预览"));
    fireEvent.press(view.getByLabelText("打开第 2 页"));
    expect(mockPageReader.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      fallbackIndex: 1,
      initialPageId: "page-2",
      restorationKey: "memory-canvas:1",
    }));

    fireEvent.press(view.getByText("页面预览"));
    fireEvent.press(view.getByLabelText("打开第 2 页"));
    expect(mockPageReader.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      fallbackIndex: 1,
      initialPageId: "page-2",
      restorationKey: "memory-canvas:2",
    }));
  });

  it("keeps the reader restoration request unchanged when preview closes without a selection", async () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [
        { id: "cover", position: 0, kind: "cover", headline: "Cover", body: "" },
        { id: "page-2", position: 1, kind: "photo", headline: "Second page", body: "" },
      ],
    });
    const view = render(<MemoryDetailScreen />);
    fireEvent.press(view.getByText("页面预览"));
    fireEvent.press(view.getByLabelText("打开第 2 页"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.getByTestId("reader-page")).toHaveTextContent("Second page");

    await act(async () => {
      const readerPan = getByGestureTestId("page-reader-pan");
      fireGestureHandler(readerPan, [
        { state: State.BEGAN, translationX: 0, translationY: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: 30, translationY: 0, velocityX: 700 },
        { state: State.END, translationX: 100, translationY: 0, velocityX: 700 },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.getByTestId("reader-page")).toHaveTextContent("Cover");

    fireEvent.press(view.getByText("页面预览"));
    mockPageReader.mockClear();

    fireEvent.press(view.getByLabelText("关闭页面预览"));

    expect(view.queryByText("页面预览 · 2 页")).toBeNull();
    expect(view.getByTestId("reader-page")).toHaveTextContent("Cover");
    expect(mockPageReader).toHaveBeenCalled();
    for (const [props] of mockPageReader.mock.calls) {
      expect(props).toEqual(expect.objectContaining({
        fallbackIndex: 1,
        initialPageId: "page-2",
        restorationKey: "memory-canvas:1",
      }));
    }
  });

  it("restores the cover when switching albums that share page ids", async () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "First album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [
        { id: "cover", position: 0, kind: "cover", headline: "First cover", body: "" },
        { id: "page-2", position: 1, kind: "photo", headline: "First second page", body: "" },
      ],
    });
    const view = render(<MemoryDetailScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      fireGestureHandler(getByGestureTestId("page-reader-pan"), [
        { state: State.BEGAN, translationX: 0, translationY: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: -30, translationY: 0, velocityX: -700 },
        { state: State.END, translationX: -100, translationY: 0, velocityX: -700 },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.getByTestId("reader-page")).toHaveTextContent("First second page");
    mockPageReader.mockClear();

    mockSearchParams = { id: "memory-other" };
    mockGetMemoryById.mockReturnValue({
      id: "memory-other", title: "Second album", city: "hangzhou", travelDate: "2026-08-01", photoUris: [],
      createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z",
      pages: [
        { id: "cover", position: 0, kind: "cover", headline: "Second cover", body: "" },
        { id: "page-2", position: 1, kind: "photo", headline: "Second second page", body: "" },
      ],
    });
    view.rerender(<MemoryDetailScreen />);

    expect(view.getByTestId("reader-page")).toHaveTextContent("Second cover");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.getByTestId("reader-page")).toHaveTextContent("Second cover");
    expect(mockPageReader).toHaveBeenCalled();
    for (const [props] of mockPageReader.mock.calls) {
      expect(props).toEqual(expect.objectContaining({
        fallbackIndex: 0,
        initialPageId: undefined,
        restorationKey: "memory-other:0",
      }));
      expect(props.pages[0]).toEqual(expect.objectContaining({ headline: "Second cover" }));
    }
  });

  it("does not reuse a preview cursor after switching memory ids", () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "First album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [
        { id: "cover", position: 0, kind: "cover", headline: "Cover", body: "" },
        { id: "page-2", position: 1, kind: "photo", headline: "Second page", body: "" },
      ],
    });
    const view = render(<MemoryDetailScreen />);
    fireEvent.press(view.getByText("页面预览"));
    fireEvent.press(view.getByLabelText("打开第 2 页"));
    mockPageReader.mockClear();

    mockSearchParams = { id: "memory-other" };
    mockGetMemoryById.mockReturnValue({
      id: "memory-other", title: "Other album", city: "hangzhou", travelDate: "2026-08-01", photoUris: [],
      createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z",
      pages: [{ id: "other-cover", position: 0, kind: "cover", headline: "Other cover", body: "" }],
    });
    view.rerender(<MemoryDetailScreen />);

    expect(mockPageReader).toHaveBeenCalled();
    for (const [props] of mockPageReader.mock.calls) {
      expect(props).toEqual(expect.objectContaining({
        fallbackIndex: 0,
        initialPageId: undefined,
        restorationKey: "memory-other:0",
      }));
      expect(props).not.toEqual(expect.objectContaining({
        fallbackIndex: 1,
        initialPageId: "page-2",
      }));
    }
  });
});
