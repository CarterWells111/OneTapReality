import { act, fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import { Alert, Modal } from "react-native";
import * as ImagePicker from "expo-image-picker";

import {
  BookCanvasEditor,
  type BookCanvasEditorHandle,
  type BookEditorChangeReason,
} from "../src/features/canvas/book-canvas-editor";
import { canvasPages } from "../src/features/canvas/editor-pages";
import type { StagedPhotoFile } from "../src/features/memories/photo-persistence";
import type { StoryPage } from "../src/types/memory";

let mockContextMenuProps: Record<string, unknown> | undefined;
let mockCurrentCanvasPageProps: Record<string, unknown> | undefined;
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

jest.mock("../src/features/canvas/canvas-page", () => {
  const actual = jest.requireActual("../src/features/canvas/canvas-page") as typeof import("../src/features/canvas/canvas-page");
  const React = require("react") as typeof import("react");
  return {
    ...actual,
    CanvasPage: (props: Record<string, unknown>) => {
      if (props.interactive) mockCurrentCanvasPageProps = props;
      return React.createElement(actual.CanvasPage, props as React.ComponentProps<typeof actual.CanvasPage>);
    },
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

function EditorHarness({ initialPageId, initialPages = pages, onChange = () => undefined, onPendingChange, persistSelectedPhoto, stageSelectedPhoto }: {
  initialPageId?: string;
  initialPages?: StoryPage[];
  onChange?: (nextPages: StoryPage[], reason: BookEditorChangeReason) => boolean | void;
  onPendingChange?: (pending: boolean) => void;
  persistSelectedPhoto?: (uri: string) => Promise<string>;
  stageSelectedPhoto?: (uri: string) => Promise<StagedPhotoFile>;
}) {
  const [currentPages, setCurrentPages] = React.useState(() => canvasPages(initialPages));
  return <BookCanvasEditor initialPageId={initialPageId} pages={currentPages} persistSelectedPhoto={persistSelectedPhoto} stageSelectedPhoto={stageSelectedPhoto} onTransformPendingChange={onPendingChange} onPagesChange={(nextPages, reason) => {
    const accepted = onChange(nextPages, reason);
    if (accepted === false) return false;
    setCurrentPages(nextPages);
    return accepted;
  }} />;
}

function stagedPhoto(uri: string) {
  return { uri, commit: jest.fn(), rollback: jest.fn(async () => undefined) } satisfies StagedPhotoFile;
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

async function dismissPageManagerForAdd(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByLabelText("添加页面"));
  fireEvent(screen.UNSAFE_getByType(Modal), "dismiss");
  await Promise.resolve();
}

const photoPages: StoryPage[] = [
  pages[0],
  {
    id: "photo-page",
    position: 1,
    kind: "photo",
    headline: "照片页",
    body: "保留正文",
    photoUri: "file:///old-one.jpg",
    layout: {
      aspectRatio: 3 / 4,
      backgroundId: "paper",
      photoTemplateId: "classic-2",
      schemaVersion: 7,
      elements: [
        { id: "old-one", type: "image", uri: "file:///old-one.jpg", x: 0.09, y: 0.09, width: 0.82, height: 0.37, rotation: 0, zIndex: 1 },
        { id: "old-two", type: "image", uri: "file:///old-two.jpg", x: 0.09, y: 0.54, width: 0.82, height: 0.37, rotation: 0, zIndex: 2 },
        { id: "caption", type: "text", text: "保留文字", fontStyle: "System", color: "#111111", fontSize: 16, x: 0.1, y: 0.8, width: 0.8, height: 0.1, rotation: 0, zIndex: 3 },
      ],
    },
  },
  pages[1],
];

const fourPhotoFreeformPages: StoryPage[] = [
  pages[0],
  {
    id: "freeform-page",
    position: 1,
    kind: "photo",
    headline: "自由排版",
    body: "保留正文",
    photoUri: "file:///freeform-1.jpg",
    layout: {
      aspectRatio: 3 / 4,
      backgroundId: "linen",
      schemaVersion: 7,
      elements: [
        { id: "freeform-1", type: "image", uri: "file:///freeform-1.jpg", x: 0.03, y: 0.04, width: 0.42, height: 0.31, rotation: -4, zIndex: 8 },
        { id: "freeform-2", type: "image", uri: "file:///freeform-2.jpg", x: 0.51, y: 0.11, width: 0.37, height: 0.28, rotation: 3, zIndex: 3 },
        { id: "freeform-3", type: "image", uri: "file:///freeform-3.jpg", x: 0.12, y: 0.48, width: 0.33, height: 0.39, rotation: 1, zIndex: 11 },
        { id: "freeform-4", type: "image", uri: "file:///freeform-4.jpg", x: 0.58, y: 0.52, width: 0.29, height: 0.34, rotation: -2, zIndex: 5 },
        { id: "freeform-caption", type: "text", text: "不要移动", fontStyle: "System", color: "#222222", fontSize: 15, x: 0.1, y: 0.9, width: 0.8, height: 0.07, rotation: 0, zIndex: 20 },
      ],
    },
  },
  pages[1],
];

describe("BookCanvasEditor", () => {
  it("exports a plain function component so Expo React Compiler can call it on Fabric", () => {
    expect(typeof BookCanvasEditor).toBe("function");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    requestPermissionMock.mockResolvedValue({ granted: true });
    launchImageLibraryMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///temporary.jpg" }],
    });
    mockContextMenuProps = undefined;
    mockCurrentCanvasPageProps = undefined;
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

  it("stages a two-photo page from page management and commits it only after template confirmation", async () => {
    const onChange = jest.fn();
    const persistSelectedPhoto = jest.fn(async (uri: string) => uri.replace("temporary", "permanent"));
    launchImageLibraryMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///temporary-one.jpg" }, { uri: "file:///temporary-two.jpg" }],
    });
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={persistSelectedPhoto} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => {
      await dismissPageManagerForAdd(screen);
    });

    expect(launchImageLibraryMock).toHaveBeenCalledWith(expect.objectContaining({
      allowsMultipleSelection: true,
      selectionLimit: 12,
    }));
    expect(persistSelectedPhoto.mock.calls.map(([uri]) => uri)).toEqual([
      "file:///temporary-one.jpg",
      "file:///temporary-two.jpg",
    ]);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText(/双图模板$/)).toHaveLength(5);

    fireEvent.press(screen.getByLabelText("杂志侧栏双图模板"));
    fireEvent.press(screen.getByLabelText("创建页面"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), "structure");
    const nextPages = onChange.mock.calls[0][0] as StoryPage[];
    expect(nextPages.map((page) => page.kind)).toEqual(["cover", "photo", "closing"]);
    expect(nextPages[1].layout).toMatchObject({ photoTemplateId: "magazine-2" });
    expect(nextPages[1].layout?.elements.filter((element) => element.type === "image").map((element) => element.uri)).toEqual([
      "file:///permanent-one.jpg",
      "file:///permanent-two.jpg",
    ]);
    expect(screen.getByText("第 2 / 3 页")).toBeTruthy();
  });

  it("does not open a layout sheet or create a page when the system picker is cancelled", async () => {
    const onChange = jest.fn();
    launchImageLibraryMock.mockResolvedValueOnce({ canceled: true, assets: [] });
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={jest.fn()} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => {
      await dismissPageManagerForAdd(screen);
    });

    expect(screen.queryByText("新建照片页面")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not create a page when the staged layout sheet is cancelled", async () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={async (uri) => uri} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => {
      await dismissPageManagerForAdd(screen);
    });
    await act(async () => { fireEvent.press(screen.getByLabelText("取消照片布局")); });

    expect(screen.queryByText("新建照片页面")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("creates a freeform page after staging four persisted photos", async () => {
    const onChange = jest.fn();
    launchImageLibraryMock.mockResolvedValueOnce({
      canceled: false,
      assets: [1, 2, 3, 4].map((index) => ({ uri: `file:///temporary-${index}.jpg` })),
    });
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={async (uri) => uri.replace("temporary", "permanent")} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => {
      await dismissPageManagerForAdd(screen);
    });

    expect(screen.getByText("模板仅支持 3 张及以内照片，仍可自行排版")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("创建自由排版页面"));

    const added = (onChange.mock.calls[0][0] as StoryPage[])[1];
    expect(added.layout?.elements.filter((element) => element.type === "image")).toHaveLength(4);
    expect(added.layout).not.toHaveProperty("photoTemplateId");
  });

  it("alerts and leaves pages unchanged when the second selected photo cannot be persisted", async () => {
    const onChange = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const persistSelectedPhoto = jest.fn()
      .mockResolvedValueOnce("file:///permanent-one.jpg")
      .mockRejectedValueOnce(new Error("iCloud unavailable"));
    launchImageLibraryMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///temporary-one.jpg" }, { uri: "file:///temporary-two.jpg" }],
    });
    const screen = render(<EditorHarness onChange={onChange} persistSelectedPhoto={persistSelectedPhoto} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => {
      await dismissPageManagerForAdd(screen);
    });

    expect(persistSelectedPhoto).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledWith("照片保存失败", expect.stringContaining("iCloud"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("新建照片页面")).toBeNull();
  });

  it("replaces an existing photo page when reselecting changes the photo count and template", async () => {
    const onChange = jest.fn();
    launchImageLibraryMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///temporary-new-one.jpg" }],
    });
    const screen = render(
      <EditorHarness
        initialPageId="photo-page"
        initialPages={photoPages}
        onChange={onChange}
        persistSelectedPhoto={async (uri) => uri.replace("temporary", "permanent")}
      />,
    );

    fireEvent.press(screen.getByText("照片布局"));
    expect(launchImageLibraryMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("重新选择照片"));
    });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("竖向切片单图模板"));
    fireEvent.press(screen.getByLabelText("应用照片布局"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = (onChange.mock.calls[0][0] as StoryPage[]).find((page) => page.id === "photo-page")!;
    expect(updated.layout).toMatchObject({ backgroundId: "paper", photoTemplateId: "columns-1" });
    expect(updated.layout?.elements.find((element) => element.id === "caption")).toMatchObject({ text: "保留文字" });
    const images = updated.layout?.elements.filter((element) => element.type === "image") ?? [];
    expect(images.map((element) => element.uri)).toEqual(["file:///permanent-new-one.jpg"]);
    expect(images.map((element) => element.id)).not.toEqual(["old-one", "old-two"]);
  });

  it("replaces photo membership after any successful reselect even when the source URI sequence matches", async () => {
    const onChange = jest.fn();
    const originalPage = photoPages[1];
    const originalImages = originalPage.layout!.elements.filter((element) => element.type === "image");
    const originalCaption = originalPage.layout!.elements.find((element) => element.id === "caption");
    launchImageLibraryMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///old-one.jpg" }, { uri: "file:///old-two.jpg" }],
    });
    const screen = render(
      <EditorHarness
        initialPageId="photo-page"
        initialPages={photoPages}
        onChange={onChange}
        persistSelectedPhoto={async (uri) => uri}
      />,
    );

    fireEvent.press(screen.getByText("照片布局"));
    await act(async () => {
      fireEvent.press(screen.getByLabelText("重新选择照片"));
    });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("竖向切片双图模板"));
    fireEvent.press(screen.getByLabelText("应用照片布局"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = (onChange.mock.calls[0][0] as StoryPage[]).find((page) => page.id === "photo-page")!;
    const updatedImages = updated.layout!.elements.filter((element) => element.type === "image");
    expect(updatedImages.map((element) => element.id)).not.toEqual(originalImages.map((element) => element.id));
    expect(updatedImages.map((element) => element.uri)).toEqual(originalImages.map((element) => element.uri));
    expect(updated.layout).toMatchObject({ backgroundId: "paper", photoTemplateId: "columns-2", schemaVersion: 7 });
    expect(updated.layout!.elements.find((element) => element.id === "caption")).toEqual(originalCaption);
  });

  it("rolls back earlier staged copies when a later copy fails", async () => {
    const onChange = jest.fn();
    const first = stagedPhoto("file:///owned-one.jpg");
    const stageSelectedPhoto = jest.fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("storage full"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    launchImageLibraryMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///temp-one.jpg" }, { uri: "file:///temp-two.jpg" }],
    });
    const screen = render(<EditorHarness onChange={onChange} stageSelectedPhoto={stageSelectedPhoto} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => { await dismissPageManagerForAdd(screen); });

    expect(first.rollback).toHaveBeenCalledTimes(1);
    expect(first.commit).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("照片保存失败", expect.stringContaining("iCloud"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rolls back staged add files on sheet cancel and commits them on confirmation", async () => {
    const cancelHandle = stagedPhoto("file:///owned-cancel.jpg");
    const commitHandle = stagedPhoto("file:///owned-commit.jpg");
    const stageSelectedPhoto = jest.fn()
      .mockResolvedValueOnce(cancelHandle)
      .mockResolvedValueOnce(commitHandle);
    const screen = render(<EditorHarness stageSelectedPhoto={stageSelectedPhoto} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => { await dismissPageManagerForAdd(screen); });
    await act(async () => { fireEvent.press(screen.getByLabelText("取消照片布局")); });
    expect(cancelHandle.rollback).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => { await dismissPageManagerForAdd(screen); });
    fireEvent.press(screen.getByLabelText("创建页面"));
    expect(commitHandle.commit).toHaveBeenCalledTimes(1);
    expect(commitHandle.rollback).not.toHaveBeenCalled();
  });

  it.each(["false", "throw"])("does not commit staged files when the parent %s-rejects the page change", async (mode) => {
    const staged = stagedPhoto("file:///owned-rejected.jpg");
    const onChange = jest.fn(() => {
      if (mode === "throw") throw new Error("commit locked");
      return false;
    });
    const onPendingChange = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = render(
      <EditorHarness
        onChange={onChange}
        onPendingChange={onPendingChange}
        stageSelectedPhoto={jest.fn().mockResolvedValue(staged)}
      />,
    );
    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => { await dismissPageManagerForAdd(screen); });
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    await act(async () => { fireEvent.press(screen.getByLabelText("创建页面")); });

    expect(staged.commit).not.toHaveBeenCalled();
    expect(staged.rollback).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("新建照片页面")).toBeNull();
    expect(screen.getByText("第 1 / 2 页")).toBeTruthy();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
    expect(alert).toHaveBeenCalledWith("照片布局未应用", expect.stringContaining("正在保存"));
  });

  it("keeps the composed pending signal true until a staged sheet is cancelled", async () => {
    const onPendingChange = jest.fn();
    const screen = render(
      <EditorHarness
        initialPageId="photo-page"
        initialPages={photoPages}
        onPendingChange={onPendingChange}
      />,
    );
    fireEvent.press(screen.getByText("照片布局"));
    expect(onPendingChange).toHaveBeenLastCalledWith(true);
    act(() => {
      (mockCurrentCanvasPageProps?.onTransformStart as (() => void) | undefined)?.();
      (mockCurrentCanvasPageProps?.onTransformSettled as (() => void) | undefined)?.();
    });
    expect(onPendingChange).toHaveBeenLastCalledWith(true);
    await act(async () => { fireEvent.press(screen.getByLabelText("取消照片布局")); });
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("rolls back superseded staged files and only commits the current replacement", async () => {
    const original = stagedPhoto("file:///owned-original.jpg");
    const replacement = stagedPhoto("file:///owned-replacement.jpg");
    const stageSelectedPhoto = jest.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(replacement);
    const screen = render(<EditorHarness stageSelectedPhoto={stageSelectedPhoto} />);
    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => { await dismissPageManagerForAdd(screen); });
    await act(async () => { fireEvent.press(screen.getByLabelText("重新选择照片")); });
    expect(original.rollback).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText("创建页面"));
    expect(replacement.commit).toHaveBeenCalledTimes(1);
    expect(replacement.rollback).not.toHaveBeenCalled();
  });

  it("stays busy until superseded staged files finish rolling back", async () => {
    let finishRollback!: () => void;
    const rollbackPending = new Promise<undefined>((resolve) => {
      finishRollback = () => resolve(undefined);
    });
    const original = stagedPhoto("file:///owned-original.jpg");
    original.rollback.mockReturnValueOnce(rollbackPending);
    const replacement = stagedPhoto("file:///owned-replacement.jpg");
    const stageSelectedPhoto = jest.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(replacement);
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} stageSelectedPhoto={stageSelectedPhoto} />);
    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => { await dismissPageManagerForAdd(screen); });

    fireEvent.press(screen.getByLabelText("重新选择照片"));
    await act(async () => undefined);
    expect(screen.getByText("正在保存照片…")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("创建页面"));
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { finishRollback(); await rollbackPending; });
    expect(screen.queryByText("正在保存照片…")).toBeNull();
    fireEvent.press(screen.getByLabelText("创建页面"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("rolls back an uncommitted staged file when the editor unmounts", async () => {
    const staged = stagedPhoto("file:///owned-unmounted.jpg");
    const screen = render(<EditorHarness stageSelectedPhoto={jest.fn().mockResolvedValue(staged)} />);
    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => { await dismissPageManagerForAdd(screen); });
    screen.unmount();
    await act(async () => undefined);
    expect(staged.rollback).toHaveBeenCalledTimes(1);
  });

  it("rolls back a stale out-of-order replacement without overwriting the newer flow", async () => {
    let resolveOld!: (value: StagedPhotoFile) => void;
    let resolveNew!: (value: StagedPhotoFile) => void;
    const oldPromise = new Promise<StagedPhotoFile>((resolve) => { resolveOld = resolve; });
    const newPromise = new Promise<StagedPhotoFile>((resolve) => { resolveNew = resolve; });
    const oldHandle = stagedPhoto("file:///owned-old-request.jpg");
    const newHandle = stagedPhoto("file:///owned-new-request.jpg");
    const stageSelectedPhoto = jest.fn()
      .mockReturnValueOnce(oldPromise)
      .mockReturnValueOnce(newPromise);
    const onChange = jest.fn();
    const screen = render(
      <EditorHarness initialPageId="photo-page" initialPages={photoPages} onChange={onChange} stageSelectedPhoto={stageSelectedPhoto} />,
    );

    fireEvent.press(screen.getByText("照片布局"));
    fireEvent.press(screen.getByLabelText("重新选择照片"));
    await act(async () => undefined);
    await act(async () => { fireEvent.press(screen.getByLabelText("取消照片布局")); });
    fireEvent.press(screen.getByText("照片布局"));
    fireEvent.press(screen.getByLabelText("重新选择照片"));
    await act(async () => { resolveNew(newHandle); await newPromise; });
    expect(screen.getByLabelText("照片 1").props.source).toEqual([{ uri: newHandle.uri }]);
    await act(async () => { resolveOld(oldHandle); await oldPromise; });
    expect(oldHandle.rollback).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText("应用照片布局"));
    const updated = (onChange.mock.calls[0][0] as StoryPage[]).find((page) => page.id === "photo-page")!;
    expect(updated.photoUri).toBe(newHandle.uri);
    expect(newHandle.commit).toHaveBeenCalledTimes(1);
  });

  it("never rolls back pre-existing page files when cancelling an edit", async () => {
    const stageSelectedPhoto = jest.fn();
    const screen = render(
      <EditorHarness initialPageId="photo-page" initialPages={photoPages} stageSelectedPhoto={stageSelectedPhoto} />,
    );
    fireEvent.press(screen.getByText("照片布局"));
    await act(async () => { fireEvent.press(screen.getByLabelText("取消照片布局")); });
    expect(stageSelectedPhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["denied", () => requestPermissionMock.mockResolvedValueOnce({ granted: false }), "无法访问照片"],
    ["permission rejection", () => requestPermissionMock.mockRejectedValueOnce(new Error("native")), "照片选择失败"],
    ["picker rejection", () => launchImageLibraryMock.mockRejectedValueOnce(new Error("native")), "照片选择失败"],
  ])("alerts on %s and leaves the page flow closed", async (_name, arrange, title) => {
    const onChange = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    arrange();
    const screen = render(<EditorHarness onChange={onChange} stageSelectedPhoto={jest.fn()} />);
    fireEvent.press(screen.getByLabelText("打开页面管理"));
    await act(async () => { await dismissPageManagerForAdd(screen); });
    expect(alert).toHaveBeenCalledWith(title, expect.any(String));
    expect(screen.queryByText("新建照片页面")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables layout actions while a replacement copy is pending and prevents overlap", async () => {
    let resolveStage!: (value: StagedPhotoFile) => void;
    const pendingStage = new Promise<StagedPhotoFile>((resolve) => { resolveStage = resolve; });
    const stageSelectedPhoto = jest.fn(() => pendingStage);
    const onChange = jest.fn();
    const screen = render(
      <EditorHarness initialPageId="photo-page" initialPages={photoPages} onChange={onChange} stageSelectedPhoto={stageSelectedPhoto} />,
    );
    fireEvent.press(screen.getByText("照片布局"));
    fireEvent.press(screen.getByLabelText("重新选择照片"));
    await act(async () => undefined);
    expect(screen.getByText("正在保存照片…")).toBeTruthy();
    expect(screen.getByLabelText("应用照片布局").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText("应用照片布局"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("重新选择照片"));
    expect(launchImageLibraryMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolveStage(stagedPhoto("file:///owned-new.jpg")); await pendingStage; });
  });

  it("clears a mismatched stale template without changing existing image geometry", () => {
    const onChange = jest.fn();
    const mismatched = structuredClone(photoPages);
    mismatched[1].layout!.photoTemplateId = "classic-3";
    const originalElements = structuredClone(mismatched[1].layout!.elements);
    const screen = render(<EditorHarness initialPageId="photo-page" initialPages={mismatched} onChange={onChange} />);
    fireEvent.press(screen.getByText("照片布局"));
    fireEvent.press(screen.getByLabelText("应用照片布局"));
    const updated = (onChange.mock.calls[0][0] as StoryPage[]).find((page) => page.id === "photo-page")!;
    expect(updated.layout).not.toHaveProperty("photoTemplateId");
    expect(updated.layout!.elements).toEqual(originalElements);
  });

  it("does not mutate an unchanged four-photo freeform page on confirm", () => {
    const onChange = jest.fn();
    const original = structuredClone(fourPhotoFreeformPages[1]);
    const screen = render(
      <EditorHarness initialPageId="freeform-page" initialPages={fourPhotoFreeformPages} onChange={onChange} />,
    );

    fireEvent.press(screen.getByText("照片布局"));
    expect(screen.getByText("模板仅支持 3 张及以内照片，仍可自行排版")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("应用照片布局"));

    expect(onChange).not.toHaveBeenCalled();
    expect(fourPhotoFreeformPages[1]).toEqual(original);
  });

  it("preserves staged and saved photos when replacement is cancelled or persistence fails", async () => {
    const onChange = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const persistSelectedPhoto = jest.fn().mockRejectedValue(new Error("storage full"));
    launchImageLibraryMock
      .mockResolvedValueOnce({ canceled: true, assets: [] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///temporary-new.jpg" }] });
    const screen = render(
      <EditorHarness initialPageId="photo-page" initialPages={photoPages} onChange={onChange} persistSelectedPhoto={persistSelectedPhoto} />,
    );

    fireEvent.press(screen.getByText("照片布局"));
    await act(async () => {
      fireEvent.press(screen.getByLabelText("重新选择照片"));
    });
    expect(screen.getByLabelText("经典留白双图模板").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("重新选择照片"));
    });
    expect(alert).toHaveBeenCalledWith("照片保存失败", expect.stringContaining("存储空间"));
    expect(screen.getByLabelText("经典留白双图模板").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the template after a manual image transform", () => {
    const onChange = jest.fn();
    render(<EditorHarness initialPageId="photo-page" initialPages={photoPages} onChange={onChange} />);

    act(() => {
      (mockCurrentCanvasPageProps?.onTransformEnd as ((id: string, patch: { x: number }) => void) | undefined)?.("old-one", { x: 0.22 });
    });

    const transformed = onChange.mock.calls.at(-1)?.[0] as StoryPage[];
    expect(transformed.find((page) => page.id === "photo-page")?.layout).not.toHaveProperty("photoTemplateId");
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
