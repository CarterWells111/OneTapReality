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
      photoUris={["file://one.jpg", "file://two.jpg"]}
      onPagesChange={(nextPages, reason) => {
        setPages(nextPages);
        onChange(nextPages, reason);
      }}
    />
  );
}

describe("BookCanvasEditor", () => {
  it("uses double press selection, exposes Done, and clears selection after changing pages", () => {
    const screen = render(<EditorHarness />);
    const firstText = screen.getByText("第一页");

    fireEvent.press(firstText);
    expect(screen.queryByText("完成")).toBeNull();
    fireEvent.press(firstText);
    expect(screen.getByText("完成")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("前往第 2 页"));
    expect(screen.queryByText("完成")).toBeNull();
    expect(screen.getByText("第二页")).toBeTruthy();
  });

  it("deselects on a blank page press without changing pages, but keeps selection on an element press", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);
    const firstText = screen.getByText("第一页");

    fireEvent.press(firstText);
    fireEvent.press(firstText);
    expect(screen.getByText("完成")).toBeTruthy();

    fireEvent.press(screen.getByTestId("album-canvas"));
    expect(screen.queryByText("完成")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.press(firstText);
    fireEvent.press(firstText);
    fireEvent.press(firstText);

    expect(screen.getByText("完成")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
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

  it("manages local photo selection, page addition, ordering and deletion in a compact menu", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    fireEvent.press(screen.getByTestId("canvas-photo-choice-0"));
    fireEvent.press(screen.getByTestId("canvas-photo-choice-1"));
    fireEvent.press(screen.getByText("添加页面"));
    expect(screen.getAllByTestId("book-page-indicator")).toHaveLength(3);

    fireEvent.press(screen.getByText("前移页面"));
    fireEvent.press(screen.getByText("后移页面"));
    fireEvent.press(screen.getByText("删除页面"));

    expect(screen.getAllByTestId("book-page-indicator")).toHaveLength(2);
    expect(onChange).toHaveBeenCalledWith(expect.any(Array), "structure");
  });

  it("disables deleting the only remaining page", () => {
    const screen = render(<EditorHarness initialPages={[sourcePages[0]]} />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    expect(screen.getByRole("button", { name: "删除页面" }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });
});
