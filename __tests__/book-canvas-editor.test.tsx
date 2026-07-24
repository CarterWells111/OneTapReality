import { fireEvent, render, userEvent } from "@testing-library/react-native";
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

  it("deselects on a blank page press without changing pages, but keeps selection on an element press", async () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);
    const user = userEvent.setup();
    const firstElement = screen.getByTestId("canvas-element-page-1:headline");

    await user.press(firstElement);
    await user.press(firstElement);
    expect(screen.getByText("完成")).toBeTruthy();

    await user.press(screen.getByTestId("album-canvas"));
    expect(screen.queryByText("完成")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    await user.press(firstElement);
    await user.press(firstElement);
    await user.press(firstElement);

    expect(screen.getByText("完成")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not reuse a component press across blank deselection", async () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);
    const user = userEvent.setup();
    const firstElement = screen.getByTestId("canvas-element-page-1:headline");

    await user.press(firstElement);
    await user.press(firstElement);
    expect(screen.getByText("完成")).toBeTruthy();

    await user.press(firstElement);
    await user.press(screen.getByTestId("album-canvas"));
    await user.press(firstElement);

    expect(screen.queryByText("完成")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not reuse an unselected component press after another component is deselected", async () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);
    const user = userEvent.setup();
    const headline = screen.getByTestId("canvas-element-page-1:headline");
    const body = screen.getByTestId("canvas-element-page-1:body");
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);

    try {
      await user.press(headline);
      now += 100;
      await user.press(headline);
      expect(screen.getByText("完成")).toBeTruthy();

      now = 2_000;
      await user.press(body);
      await user.press(screen.getByTestId("album-canvas"));
      now += 100;
      await user.press(body);
    } finally {
      nowSpy.mockRestore();
    }

    expect(screen.queryByText("完成")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adds a categorized sticker and automatically selects it", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);

    fireEvent.press(screen.getByText("贴纸 2"));
    fireEvent.press(screen.getByLabelText("添加贴纸 2-01"));

    const latestPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[] | undefined;
    expect(latestPages?.[0].layout?.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "sticker", stickerId: "sticker2-01" }),
      ]),
    );
    expect(screen.getByText("完成")).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.any(Array),
      "structure",
    );
  });

  it("sets a background on the current page from the asset tray", () => {
    const onChange = jest.fn();
    const screen = render(<EditorHarness onChange={onChange} />);

    fireEvent.press(screen.getByText("背景"));
    fireEvent.press(screen.getByLabelText("选择背景 01"));

    const latestPages = onChange.mock.calls.at(-1)?.[0] as StoryPage[] | undefined;
    expect(latestPages?.[0].layout?.backgroundId).toBe("background-01");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.any(Array),
      "structure",
    );
  });

  it("removes untouched default text when the user starts another action", () => {
    const screen = render(<EditorHarness />);

    fireEvent.press(screen.getByText("添加文字"));
    expect(screen.getByText("点击编辑文字")).toBeTruthy();

    fireEvent.press(screen.getByText("贴纸 2"));

    expect(screen.queryByText("点击编辑文字")).toBeNull();
  });

  it("keeps default text after its contents change", () => {
    const screen = render(<EditorHarness />);

    fireEvent.press(screen.getByText("添加文字"));
    fireEvent.changeText(screen.getByLabelText("编辑选中文字"), "在山路上遇见日落");
    fireEvent.press(screen.getByText("贴纸 2"));

    expect(screen.getByText("在山路上遇见日落")).toBeTruthy();
  });

  it("keeps default text after the user presses its canvas element", () => {
    const screen = render(<EditorHarness />);

    fireEvent.press(screen.getByText("添加文字"));
    fireEvent.press(screen.getByText("点击编辑文字"));
    fireEvent.press(screen.getByText("贴纸 2"));

    expect(screen.getByText("点击编辑文字")).toBeTruthy();
  });

  it("does not confirm default text when its input only receives focus", () => {
    const screen = render(<EditorHarness />);

    fireEvent.press(screen.getByText("添加文字"));
    fireEvent(screen.getByLabelText("编辑选中文字"), "focus");
    fireEvent.press(screen.getByText("贴纸 2"));

    expect(screen.queryByText("点击编辑文字")).toBeNull();
  });

  it("opens the page manager overlay from the toolbar", () => {
    const screen = render(<EditorHarness />);

    fireEvent.press(screen.getByLabelText("打开页面管理"));

    expect(screen.getByLabelText("完成页面管理")).toBeTruthy();
    expect(screen.getByTestId("page-cell-0")).toBeTruthy();
    expect(screen.getByTestId("page-cell-1")).toBeTruthy();
  });
});
