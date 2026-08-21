import { act, fireEvent, render } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { StyleSheet } from "react-native";

const mockGetMemoryById = jest.fn();
const mockPush = jest.fn();
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
        <View>{options?.headerRight ? options.headerRight() : null}</View>
      ),
    },
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
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
  useMemories: () => ({ deleteMemory: jest.fn(), getMemoryById: mockGetMemoryById }),
}));

jest.mock("../src/features/export/share-action-sheet", () => ({ showShareActionSheet: (...args: unknown[]) => mockShare(...args) }));

import MemoryDetailScreen from "../src/app/memory/[id]";

describe("MemoryDetailScreen canvas rendering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: "memory-canvas" };
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

  it("shows explicit local edit, share, and gift binding actions without consulting shared roles", () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [{ id: "cover", position: 0, kind: "cover", headline: "Cover", body: "", layout: { aspectRatio: 0.75, elements: [] } }],
    });
    const view = render(<MemoryDetailScreen />);

    fireEvent.press(view.getByText("编辑相册"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/memory/[id]/edit",
      params: { id: "memory-canvas", pageId: "cover", pageIndex: "0" },
    });
    fireEvent.press(view.getByText("分享相册"));
    expect(mockShare).toHaveBeenCalled();
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

  it("offers page preview for the built-in sample album", () => {
    mockSearchParams = { id: "sample-hangzhou" };

    const view = render(<MemoryDetailScreen />);

    expect(view.getByText("页面预览")).toBeTruthy();
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
