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

const editorLabel = "\u7f16\u8f91\u9009\u4e2d\u6587\u5b57";
const stickerCategory = "\u8d34\u7eb8 2";
const stickerChoice = "\u6dfb\u52a0\u8d34\u7eb8 2-01";
const backgroundTray = "\u80cc\u666f";
const backgroundChoice = "\u9009\u62e9\u80cc\u666f 01";

describe("BookCanvasEditor", () => {
  it("opens the text editor after a double press", () => {
    const screen = render(<EditorHarness />);
    const headline = screen.getByTestId("canvas-element-page-1:headline");

    fireEvent.press(headline);
    expect(screen.queryByLabelText(editorLabel)).toBeNull();
    fireEvent.press(headline);

    expect(screen.getByLabelText(editorLabel)).toBeTruthy();
  });

  it("clears a selected editor on a blank-page press without persisting changes", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);
    const headline = screen.getByTestId("canvas-element-page-1:headline");

    fireEvent.press(headline);
    fireEvent.press(headline);
    expect(screen.getByLabelText(editorLabel)).toBeTruthy();

    fireEvent.press(screen.getByTestId("album-canvas"));

    expect(screen.queryByLabelText(editorLabel)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
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

    fireEvent.press(screen.getByLabelText("\u6253\u5f00\u9875\u9762\u7ba1\u7406"));

    expect(screen.getByLabelText("\u5b8c\u6210\u9875\u9762\u7ba1\u7406")).toBeTruthy();
    expect(screen.getByTestId("page-cell-0")).toBeTruthy();
    expect(screen.getByTestId("page-cell-1")).toBeTruthy();
  });
});
