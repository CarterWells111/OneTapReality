import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";

import {
  BookCanvasEditor,
  type BookEditorChangeReason,
} from "../src/features/canvas/book-canvas-editor";
import { canvasPages } from "../src/features/canvas/editor-pages";
import type { StoryPage } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sourcePages: StoryPage[] = [
  {
    id: "page-1",
    position: 0,
    kind: "cover",
    headline: "第一页",
    body: "第一页正文",
  },
  {
    id: "page-2",
    position: 1,
    kind: "closing",
    headline: "第二页",
    body: "第二页正文",
  },
];

function EditorHarness({
  initialPages = sourcePages,
  onChange = () => undefined,
}: {
  initialPages?: StoryPage[];
  onChange?: (pages: StoryPage[], reason: BookEditorChangeReason) => void;
}) {
  const [pages, setPages] = React.useState(() => canvasPages(initialPages));
  return (
    <BookCanvasEditor
      pages={pages}
      onPagesChange={(nextPages, reason) => {
        setPages(nextPages);
        onChange(nextPages, reason);
      }}
    />
  );
}

describe("BookCanvasEditor", () => {
  it("uses double press selection and exposes Done", () => {
    const screen = render(<EditorHarness />);
    const firstText = screen.getByText("第一页");

    fireEvent.press(firstText);
    expect(screen.queryByText("完成")).toBeNull();
    fireEvent.press(firstText);
    expect(screen.getByText("完成")).toBeTruthy();
  });

  it("adds a categorized sticker and automatically selects it", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);

    fireEvent.press(screen.getByText("旅行"));
    fireEvent.press(screen.getByLabelText("添加相机"));

    expect(screen.getAllByText("📷")).toHaveLength(2);
    expect(screen.getByText("完成")).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.any(Array),
      "structure",
    );
  });

  it("opens the page manager overlay from the toolbar", () => {
    const screen = render(<EditorHarness />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));

    expect(screen.getByLabelText("完成页面管理")).toBeTruthy();
    expect(screen.getByTestId("page-cell-0")).toBeTruthy();
    expect(screen.getByTestId("page-cell-1")).toBeTruthy();
  });
});
