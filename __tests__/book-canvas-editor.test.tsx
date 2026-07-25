import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";

import {
  BookCanvasEditor,
  type BookEditorChangeReason,
} from "../src/features/canvas/book-canvas-editor";
import { canvasPages } from "../src/features/canvas/editor-pages";
import type { StoryPage } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pages: StoryPage[] = [
  { id: "page-1", position: 0, kind: "cover", headline: "First page", body: "First body" },
  { id: "page-2", position: 1, kind: "closing", headline: "Last page", body: "Last body" },
];

function EditorHarness({ onChange = () => undefined }: {
  onChange?: (nextPages: StoryPage[], reason: BookEditorChangeReason) => void;
}) {
  const [currentPages, setCurrentPages] = React.useState(() => canvasPages(pages));
  return <BookCanvasEditor pages={currentPages} onPagesChange={(nextPages, reason) => {
    setCurrentPages(nextPages);
    onChange(nextPages, reason);
  }} />;
}

const editorLabel = "编辑选中文字";
const stickerCategory = "贴纸 2";
const stickerChoice = "添加贴纸 2-01";
const backgroundTray = "背景";
const backgroundChoice = "选择背景 01";

describe("BookCanvasEditor", () => {
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
});
