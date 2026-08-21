import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import { StyleSheet } from "react-native";

import { canvasPages } from "../src/features/canvas/editor-pages";
import { PageManagerSheet } from "../src/features/canvas/page-manager-sheet";
import type { StoryPage } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pages: StoryPage[] = canvasPages([
  { id: "a", position: 0, kind: "cover", headline: "A", body: "" },
  { id: "b", position: 1, kind: "photo", headline: "B", body: "" },
]);

describe("PageManagerSheet", () => {
  it("selects a page and deletes it via the toolbar", () => {
    const onChange = jest.fn();
    const screen = render(
      <PageManagerSheet onChange={onChange} onClose={() => undefined} pages={pages} />,
    );

    fireEvent.press(screen.getByLabelText("第 1 页"));
    fireEvent.press(screen.getByLabelText("删除所选页面"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((page: StoryPage) => page.id)).toEqual(["b"]);
  });

  it("adds a page when nothing is selected", () => {
    const onChange = jest.fn();
    const screen = render(
      <PageManagerSheet onChange={onChange} onClose={() => undefined} pages={pages} />,
    );

    fireEvent.press(screen.getByLabelText("添加页面"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(3);
  });

  it("renders page state as an overlay without shrinking the thumbnail canvas", () => {
    const screen = render(
      <PageManagerSheet onChange={() => undefined} onClose={() => undefined} pages={pages} />,
    );

    const firstCanvasBefore = StyleSheet.flatten(screen.getAllByTestId("album-canvas")[0].props.style);
    fireEvent.press(screen.getByLabelText("第 1 页"));
    const stateOverlay = screen.getByTestId("page-thumbnail-state-a");

    expect(stateOverlay.props.pointerEvents).toBe("none");
    expect(StyleSheet.flatten(stateOverlay.props.style)).toMatchObject({
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    });
    expect(StyleSheet.flatten(screen.getAllByTestId("album-canvas")[0].props.style)).toMatchObject({
      height: firstCanvasBefore.height,
      width: firstCanvasBefore.width,
    });
  });

  it("opens a page without changing pages in preview mode", () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    const onJumpToPage = jest.fn();
    const screen = render(
      <PageManagerSheet
        mode="preview"
        onChange={onChange}
        onClose={onClose}
        onJumpToPage={onJumpToPage}
        pages={pages}
      />,
    );

    expect(screen.getByText("页面预览 · 2 页")).toBeTruthy();
    expect(screen.getByText("点击页面即可打开")).toBeTruthy();
    expect(screen.queryByLabelText("添加页面")).toBeNull();
    expect(screen.queryByLabelText("删除所选页面")).toBeNull();
    expect(screen.queryByLabelText("第 1 页")).toBeNull();

    fireEvent.press(screen.getByLabelText("打开第 2 页"));

    expect(onJumpToPage).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows preview mode to omit onChange and close from the header", () => {
    const onClose = jest.fn();
    const screen = render(
      <PageManagerSheet
        mode="preview"
        onClose={onClose}
        onJumpToPage={() => undefined}
        pages={pages}
      />,
    );

    fireEvent.press(screen.getByLabelText("关闭页面预览"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
