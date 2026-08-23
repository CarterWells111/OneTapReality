import { act, fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

import {
  BookCanvasEditor,
  type BookCanvasEditorHandle,
  type BookEditorChangeReason,
} from "../src/features/canvas/book-canvas-editor";
import { canvasPages } from "../src/features/canvas/editor-pages";
import type { StoryPage } from "../src/types/memory";

let mockContextMenuProps: Record<string, unknown> | undefined;
const mockEmitDiagnostic = jest.fn();

jest.mock("../src/features/diagnostics/local-diagnostics", () => ({
  localDiagnostics: { emit: (...args: unknown[]) => mockEmitDiagnostic(...args) },
}));

jest.mock("../src/features/canvas/element-context-menu", () => ({
  ElementContextMenu: (props: Record<string, unknown>) => {
    const React = require("react") as typeof import("react");
    const { View } = require("react-native") as typeof import("react-native");
    mockContextMenuProps = props;
    return React.createElement(View, { testID: "mock-element-context-menu" });
  },
}));

jest.mock("../src/features/canvas/selection-handles", () => {
  const React = require("react") as typeof import("react");
  const { Pressable } = require("react-native") as typeof import("react-native");
  return {
    SelectionHandles: ({
      elemH,
      elemW,
      onHandleDragEnd,
      onHandleDragStart,
    }: {
      elemH: { value: number };
      elemW: { value: number };
      onHandleDragEnd: (generation: number) => void;
      onHandleDragStart: () => void;
    }) => React.createElement(
      React.Fragment,
      null,
      React.createElement(Pressable, { onPress: onHandleDragStart, testID: "begin-book-handle-transform" }),
      React.createElement(Pressable, {
        onPress: () => {
          elemW.value /= 2;
          elemH.value /= 2;
          onHandleDragEnd(0);
        },
        testID: "commit-book-handle-transform",
      }),
    ),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const requestPermissionMock = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const launchImageLibraryMock = ImagePicker.launchImageLibraryAsync as jest.Mock;

const pages: StoryPage[] = [
  { id: "page-1", position: 0, kind: "cover", headline: "First page", body: "First body" },
  { id: "page-2", position: 1, kind: "closing", headline: "Last page", body: "Last body" },
];

function EditorHarness({ initialPageId, onChange = () => undefined, persistSelectedPhoto }: {
  initialPageId?: string;
  onChange?: (nextPages: StoryPage[], reason: BookEditorChangeReason) => void;
  persistSelectedPhoto?: (uri: string) => Promise<string>;
}) {
  const [currentPages, setCurrentPages] = React.useState(() => canvasPages(pages));
  return <BookCanvasEditor initialPageId={initialPageId} pages={currentPages} persistSelectedPhoto={persistSelectedPhoto} onPagesChange={(nextPages, reason) => {
    setCurrentPages(nextPages);
    onChange(nextPages, reason);
  }} />;
}

function CursorHarness({ onActivePageChange }: {
  onActivePageChange: jest.Mock;
}) {
  const [currentPages, setCurrentPages] = React.useState(() => canvasPages(pages));
  return (
    <BookCanvasEditor
      pages={currentPages}
      onActivePageChange={onActivePageChange}
      onPagesChange={(nextPages) => setCurrentPages(nextPages)}
    />
  );
}

function SaveBoundaryHarness({ editorRef, onChange = () => undefined }: {
  editorRef: React.RefObject<BookCanvasEditorHandle | null>;
  onChange?: (nextPages: StoryPage[], reason: BookEditorChangeReason) => void;
}) {
  const [currentPages, setCurrentPages] = React.useState(() => canvasPages(pages));
  return (
    <BookCanvasEditor
      ref={editorRef}
      pages={currentPages}
      onPagesChange={(nextPages, reason) => {
        setCurrentPages(nextPages);
        onChange(nextPages, reason);
      }}
    />
  );
}

const editorLabel = "编辑选中文字";
const stickerCategory = "贴纸 2";
const stickerChoice = "添加贴纸 2-01";
const backgroundTray = "背景";
const backgroundChoice = "选择背景 01";

describe("BookCanvasEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestPermissionMock.mockResolvedValue({ granted: true });
    launchImageLibraryMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///temporary.jpg" }],
    });
    mockContextMenuProps = undefined;
  });

  function openStyleMenu(screen: ReturnType<typeof render>, label: "颜色" | "字号") {
    const headline = screen.getByTestId("canvas-element-page-1:headline");
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);
    fireEvent.press(headline);
    fireEvent.press(headline);
    fireEvent.press(screen.getByText(label));
    nowSpy.mockRestore();
    return headline;
  }

  it("owns a stable text-color shared preview and commits it once", () => {
    const enqueueRecovery = jest.fn();
    const screen = render(<EditorHarness onChange={enqueueRecovery} />);
    const headline = openStyleMenu(screen, "颜色");

    const previewValue = mockContextMenuProps?.colorPreview as { value: string } | undefined;
    const committedColor = previewValue?.value;
    const menuPropsBeforePreview = mockContextMenuProps;
    expect(previewValue).toBeDefined();
    expect(mockContextMenuProps?.onPreviewColor).toBeUndefined();
    act(() => { previewValue!.value = "#123456"; });

    expect(enqueueRecovery).not.toHaveBeenCalled();
    expect(mockContextMenuProps).toBe(menuPropsBeforePreview);
    expect(screen.getByTestId("canvas-element-page-1:headline")).toBe(headline);
    expect(screen.getByText("颜色")).toBeTruthy();

    act(() => {
      (mockContextMenuProps?.onChangeColor as ((color: string) => void) | undefined)?.("#12");
    });
    expect(enqueueRecovery).not.toHaveBeenCalled();

    mockEmitDiagnostic.mockClear();
    act(() => {
      (mockContextMenuProps?.onCancelColor as (() => void) | undefined)?.();
    });
    expect(enqueueRecovery).not.toHaveBeenCalled();
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("style_transaction_finalized", {
      elementId: "page-1:headline",
      outcome: "cancel",
      pageId: "page-1",
      property: "color",
    });

    act(() => {
      (mockContextMenuProps?.onChangeColor as ((color: string) => void) | undefined)?.(committedColor!.toLowerCase());
    });
    expect(enqueueRecovery).not.toHaveBeenCalled();
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("style_transaction_finalized", {
      elementId: "page-1:headline",
      outcome: "no_op",
      pageId: "page-1",
      property: "color",
    });

    act(() => {
      (mockContextMenuProps?.onChangeColor as ((color: string) => void) | undefined)?.("#123456");
    });

    expect(enqueueRecovery).toHaveBeenCalledTimes(1);
    const committedPages = enqueueRecovery.mock.calls[0][0] as StoryPage[];
    expect(committedPages[0].layout?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "page-1:headline", color: "#123456" }),
    ]));
    expect(mockEmitDiagnostic).toHaveBeenLastCalledWith("style_transaction_finalized", {
      elementId: "page-1:headline",
      outcome: "commit",
      pageId: "page-1",
      property: "color",
    });

    fireEvent.press(screen.getByText("↩"));
    expect(enqueueRecovery).toHaveBeenCalledTimes(2);
    const restoredPages = enqueueRecovery.mock.calls[1][0] as StoryPage[];
    expect(restoredPages[0].layout?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "page-1:headline", color: committedColor }),
    ]));
    fireEvent.press(screen.getByText("↩"));
    expect(enqueueRecovery).toHaveBeenCalledTimes(2);
  });

  it("owns a stable font-size shared preview and rejects invalid final sizes", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);
    const headline = openStyleMenu(screen, "字号");

    const previewValue = mockContextMenuProps?.fontSizePreview as { value: number } | undefined;
    const committedFontSize = previewValue?.value;
    const menuPropsBeforePreview = mockContextMenuProps;
    expect(previewValue).toBeDefined();
    expect(mockContextMenuProps?.onPreviewSize).toBeUndefined();
    act(() => { previewValue!.value = 28; });

    expect(onChange).not.toHaveBeenCalled();
    expect(mockContextMenuProps).toBe(menuPropsBeforePreview);
    expect(screen.getByTestId("canvas-element-page-1:headline")).toBe(headline);

    act(() => {
      (mockContextMenuProps?.onChangeSize as ((size: number) => void) | undefined)?.(Number.NaN);
      (mockContextMenuProps?.onChangeSize as ((size: number) => void) | undefined)?.(200);
    });
    expect(onChange).not.toHaveBeenCalled();

    mockEmitDiagnostic.mockClear();
    act(() => {
      (mockContextMenuProps?.onCancelSize as (() => void) | undefined)?.();
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("style_transaction_finalized", {
      elementId: "page-1:headline",
      outcome: "cancel",
      pageId: "page-1",
      property: "fontSize",
    });

    act(() => {
      (mockContextMenuProps?.onChangeSize as ((size: number) => void) | undefined)?.(committedFontSize!);
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(mockEmitDiagnostic).toHaveBeenCalledWith("style_transaction_finalized", {
      elementId: "page-1:headline",
      outcome: "no_op",
      pageId: "page-1",
      property: "fontSize",
    });

    act(() => {
      (mockContextMenuProps?.onChangeSize as ((size: number) => void) | undefined)?.(28);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const committedPages = onChange.mock.calls[0][0] as StoryPage[];
    expect(committedPages[0].layout?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "page-1:headline", fontSize: 28 }),
    ]));
    expect(mockEmitDiagnostic).toHaveBeenLastCalledWith("style_transaction_finalized", {
      elementId: "page-1:headline",
      outcome: "commit",
      pageId: "page-1",
      property: "fontSize",
    });
  });

  it("prepares one snapshot containing multiline text and a closed style draft", async () => {
    const editorRef = React.createRef<BookCanvasEditorHandle>();
    const screen = render(<SaveBoundaryHarness editorRef={editorRef} />);
    const headline = openStyleMenu(screen, "字号");

    act(() => {
      (mockContextMenuProps?.onFontSizeDraftChange as ((value: number) => void) | undefined)?.(28);
    });
    act(() => {
      (mockContextMenuProps?.onClose as (() => void) | undefined)?.();
    });
    fireEvent.press(headline);
    fireEvent.press(headline);
    fireEvent.press(screen.getByText("编辑"));
    fireEvent.changeText(screen.getByLabelText(editorLabel), "第一行\n第二行");

    const snapshot = await editorRef.current!.prepareSave();
    const savedText = snapshot!.pages[0].layout!.elements.find((element) => element.id === "page-1:headline");
    expect(savedText).toMatchObject({ fontSize: 28, text: "第一行\n第二行" });
  });

  it("prepares the shared font-size preview while its style panel remains open", async () => {
    const editorRef = React.createRef<BookCanvasEditorHandle>();
    const onChange = jest.fn();
    const screen = render(<SaveBoundaryHarness editorRef={editorRef} onChange={onChange} />);
    openStyleMenu(screen, "字号");

    const previewValue = mockContextMenuProps?.fontSizePreview as { value: number };
    act(() => { previewValue.value = 30; });

    const snapshot = await editorRef.current!.prepareSave();
    expect(snapshot!.pages[0].layout!.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "page-1:headline", fontSize: 30 }),
    ]));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a style-only new text after preparing and releasing an in-place save", async () => {
    const editorRef = React.createRef<BookCanvasEditorHandle>();
    const onChange = jest.fn();
    const screen = render(<SaveBoundaryHarness editorRef={editorRef} onChange={onChange} />);

    fireEvent.press(screen.getByText("添加文字"));
    const addedPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[];
    const addedText = addedPages[0].layout!.elements.find((element) => element.type === "text"
      && !element.id.endsWith(":headline")
      && !element.id.endsWith(":body"));
    expect(addedText).toBeDefined();

    fireEvent.press(screen.getByText("字号"));
    act(() => {
      (mockContextMenuProps?.onFontSizeDraftChange as ((value: number) => void) | undefined)?.(28);
    });

    let snapshot: Awaited<ReturnType<BookCanvasEditorHandle["prepareSave"]>>;
    await act(async () => {
      snapshot = await editorRef.current!.prepareSave();
    });
    expect(snapshot!.pages[0].layout!.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: addedText!.id, fontSize: 28 }),
    ]));

    act(() => editorRef.current!.releaseSaveLock());
    fireEvent.press(screen.getByTestId("album-canvas"));

    const pagesAfterBlankPress = onChange.mock.calls.at(-1)?.[0] as StoryPage[];
    expect(pagesAfterBlankPress[0].layout!.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: addedText!.id }),
    ]));
  });

  it("consumes a prepared style draft instead of reapplying it to later page state", async () => {
    const editorRef = React.createRef<BookCanvasEditorHandle>();
    const initialPages = canvasPages(pages);
    const screen = render(
      <BookCanvasEditor ref={editorRef} pages={initialPages} onPagesChange={() => undefined} />,
    );
    openStyleMenu(screen, "字号");
    act(() => {
      (mockContextMenuProps?.onFontSizeDraftChange as ((value: number) => void) | undefined)?.(28);
      (mockContextMenuProps?.onClose as (() => void) | undefined)?.();
    });

    await expect(editorRef.current!.prepareSave()).resolves.toMatchObject({
      pages: [expect.objectContaining({
        layout: expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ id: "page-1:headline", fontSize: 28 }),
          ]),
        }),
      }), expect.anything()],
    });
    act(() => editorRef.current!.releaseSaveLock());

    screen.rerender(
      <BookCanvasEditor ref={editorRef} pages={initialPages} onPagesChange={() => undefined} />,
    );
    const laterSnapshot = await editorRef.current!.prepareSave();
    expect(laterSnapshot!.pages[0].layout!.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "page-1:headline", fontSize: 22 }),
    ]));
  });

  it("prepares the page-manager jump cursor synchronously", async () => {
    const editorRef = React.createRef<BookCanvasEditorHandle>();
    const screen = render(<SaveBoundaryHarness editorRef={editorRef} />);
    fireEvent.press(screen.getByLabelText("打开页面管理"));
    fireEvent.press(screen.getAllByText("打开")[1]);

    await expect(editorRef.current!.prepareSave()).resolves.toMatchObject({
      cursor: { pageId: "page-2", index: 1 },
    });
  });

  it("waits for an active transform and includes its final geometry", async () => {
    const editorRef = React.createRef<BookCanvasEditorHandle>();
    const screen = render(<SaveBoundaryHarness editorRef={editorRef} />);
    const headline = screen.getByTestId("canvas-element-page-1:headline");
    fireEvent.press(headline);
    fireEvent.press(headline);
    const original = canvasPages(pages)[0].layout!.elements.find((element) => element.id === "page-1:headline")!;

    fireEvent.press(screen.getByTestId("begin-book-handle-transform"));
    let resolved = false;
    const pendingSnapshot = editorRef.current!.prepareSave().then((snapshot) => {
      resolved = true;
      return snapshot;
    });
    await act(async () => Promise.resolve());
    expect(resolved).toBe(false);

    fireEvent.press(screen.getByTestId("commit-book-handle-transform"));
    const snapshot = await pendingSnapshot;
    const savedText = snapshot!.pages[0].layout!.elements.find((element) => element.id === "page-1:headline")!;
    expect(savedText.height).toBeCloseTo(original.height / 2);
    expect(savedText.width).toBeCloseTo(original.width / 2);
  });

  it("opens on the requested page instead of always starting at the cover", () => {
    const screen = render(<EditorHarness initialPageId="page-2" />);

    expect(screen.getByTestId("canvas-element-page-2:headline")).toBeTruthy();
    expect(screen.queryByTestId("canvas-element-page-1:headline")).toBeNull();
  });

  it("opens the text editor via the edit button after double press", () => {
    const screen = render(<EditorHarness />);
    const headline = screen.getByTestId("canvas-element-page-1:headline");
    const nowSpy = jest.spyOn(Date, "now");

    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);
    try {
      fireEvent.press(headline);
      expect(screen.queryByLabelText(editorLabel)).toBeNull();
      // Double-tap selects the element
      fireEvent.press(headline);
      // The '编辑' button should now be visible in the toolbar
      expect(screen.queryByText("编辑")).toBeTruthy();
      // Text editor only opens after clicking the '编辑' button (Feature #3b)
      expect(screen.queryByLabelText(editorLabel)).toBeNull();
      fireEvent.press(screen.getByText("编辑"));
      expect(screen.getByLabelText(editorLabel)).toBeTruthy();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("clears a selected editor on a blank-page press without persisting changes, requires edit button to re-edit", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);
    const headline = screen.getByTestId("canvas-element-page-1:headline");
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);

    try {
      fireEvent.press(headline);
      now += 100;
      fireEvent.press(headline);
      fireEvent.press(screen.getByText("编辑"));
      expect(screen.getByLabelText(editorLabel)).toBeTruthy();

      fireEvent.press(screen.getByTestId("album-canvas"));

      expect(screen.queryByLabelText(editorLabel)).toBeNull();
      expect(onChange).not.toHaveBeenCalled();

      // Re-select and re-edit
      now += 500;
      fireEvent.press(headline);
      now += 100;
      fireEvent.press(headline);
      fireEvent.press(screen.getByText("编辑"));
      expect(screen.getByLabelText(editorLabel)).toBeTruthy();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("adds a sticker and selects it for layer editing", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);

    fireEvent.press(screen.getByText(stickerCategory));
    fireEvent.press(screen.getByLabelText(stickerChoice));

    const latestPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[] | undefined;
    expect(latestPages?.[0].layout?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "sticker", stickerId: "sticker2-01" }),
    ]));
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), "structure");
  });

  it("sets the current page background from the asset tray", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);

    fireEvent.press(screen.getByText(backgroundTray));
    fireEvent.press(screen.getByLabelText(backgroundChoice));

    const latestPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[] | undefined;
    expect(latestPages?.[0].layout?.backgroundId).toBe("background-01");
  });

  it("opens page management from the toolbar", () => {
    const screen = render(<EditorHarness />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));

    expect(screen.getByLabelText("完成页面管理")).toBeTruthy();
    expect(screen.getByTestId("page-cell-0")).toBeTruthy();
    expect(screen.getByTestId("page-cell-1")).toBeTruthy();
  });

  it("reports the stable page cursor after jumping to a page from page management", () => {
    const onActivePageChange = jest.fn();
    const screen = render(<CursorHarness onActivePageChange={onActivePageChange} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    fireEvent.press(screen.getAllByText("打开")[1]);

    expect(onActivePageChange).toHaveBeenLastCalledWith({ pageId: "page-2", index: 1 });
  });

  it("reports only a valid consistent cursor when pages shrink past the active index", () => {
    const onActivePageChange = jest.fn();
    const threePages = canvasPages([
      ...pages,
      { id: "page-3", position: 2, kind: "photo", headline: "Third page", body: "Third body" },
    ]);
    const view = render(
      <BookCanvasEditor
        pages={threePages}
        onActivePageChange={onActivePageChange}
        onPagesChange={() => undefined}
      />,
    );

    fireEvent.press(view.getByLabelText("打开页面管理"));
    fireEvent.press(view.getAllByText("打开")[2]);
    onActivePageChange.mockClear();

    view.rerender(
      <BookCanvasEditor
        pages={threePages.slice(0, 1)}
        onActivePageChange={onActivePageChange}
        onPagesChange={() => undefined}
      />,
    );

    expect(onActivePageChange).toHaveBeenCalledTimes(1);
    expect(onActivePageChange).toHaveBeenCalledWith({ pageId: "page-1", index: 0 });
  });

  it("keeps the active page by id across reorder and clamps its old index only after deletion", () => {
    const onActivePageChange = jest.fn();
    const threePages = canvasPages([
      ...pages,
      { id: "page-3", position: 2, kind: "photo", headline: "Third page", body: "Third body" },
    ]);
    const view = render(
      <BookCanvasEditor pages={threePages} onActivePageChange={onActivePageChange} onPagesChange={() => undefined} />,
    );
    fireEvent.press(view.getByLabelText("打开页面管理"));
    fireEvent.press(view.getAllByText("打开")[1]);
    onActivePageChange.mockClear();

    const reordered = [threePages[1], threePages[0], threePages[2]];
    view.rerender(
      <BookCanvasEditor pages={reordered} onActivePageChange={onActivePageChange} onPagesChange={() => undefined} />,
    );
    expect(onActivePageChange).toHaveBeenLastCalledWith({ pageId: "page-2", index: 0 });

    onActivePageChange.mockClear();
    view.rerender(
      <BookCanvasEditor pages={reordered.slice(1)} onActivePageChange={onActivePageChange} onPagesChange={() => undefined} />,
    );
    expect(onActivePageChange).toHaveBeenLastCalledWith({ pageId: "page-1", index: 0 });
  });

  it("deduplicates cursor notifications while retaining the latest callback", () => {
    const firstCallback = jest.fn();
    const latestCallback = jest.fn();
    const initialPages = canvasPages(pages);
    const view = render(
      <BookCanvasEditor pages={initialPages} onActivePageChange={firstCallback} onPagesChange={() => undefined} />,
    );
    expect(firstCallback).toHaveBeenCalledTimes(1);

    view.rerender(
      <BookCanvasEditor
        pages={[{ ...initialPages[0], headline: "Updated" }, initialPages[1]]}
        onActivePageChange={latestCallback}
        onPagesChange={() => undefined}
      />,
    );
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(latestCallback).not.toHaveBeenCalled();

    fireEvent.press(view.getByLabelText("打开页面管理"));
    fireEvent.press(view.getAllByText("打开")[1]);
    expect(latestCallback).toHaveBeenCalledTimes(1);
    expect(latestCallback).toHaveBeenCalledWith({ pageId: "page-2", index: 1 });
  });

  it("adds a selected photo only after it is copied to permanent storage", async () => {
    const onChange = jest.fn();
    const persistSelectedPhoto = jest.fn().mockResolvedValue("file:///Documents/account/memory/photo.jpg");
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={persistSelectedPhoto} />);

    await act(async () => {
      fireEvent.press(screen.getByText("📷 添加照片"));
    });

    expect(persistSelectedPhoto).toHaveBeenCalledWith("file:///temporary.jpg");
    const latestPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[];
    expect(latestPages[0].layout?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image", uri: "file:///Documents/account/memory/photo.jpg" }),
    ]));
  });

  it("shows an alert and leaves the canvas unchanged when a selected photo cannot be copied", async () => {
    const onChange = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={jest.fn().mockRejectedValue(new Error("no space"))} />);

    await act(async () => {
      fireEvent.press(screen.getByText("📷 添加照片"));
    });

    expect(alert).toHaveBeenCalledWith("照片保存失败", expect.stringContaining("iCloud"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("persists a cover before applying it and keeps the existing cover on failure", async () => {
    const onChange = jest.fn();
    const persistSelectedPhoto = jest.fn()
      .mockResolvedValueOnce("file:///Documents/account/memory/cover.jpg")
      .mockRejectedValueOnce(new Error("permission changed"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={persistSelectedPhoto} />);

    fireEvent.press(screen.getByText("封面"));
    await act(async () => {
      fireEvent.press(screen.getByLabelText("上传封面背景图"));
    });
    const appliedPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[];
    expect(appliedPages[0].coverImage).toBe("file:///Documents/account/memory/cover.jpg");
    expect(appliedPages[0].layout?.coverImage).toBe("file:///Documents/account/memory/cover.jpg");

    await act(async () => {
      fireEvent.press(screen.getByLabelText("上传封面背景图"));
    });
    expect(alert).toHaveBeenCalledWith("照片保存失败", expect.stringContaining("存储空间"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
