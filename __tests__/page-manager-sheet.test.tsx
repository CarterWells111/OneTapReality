import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";
import { StyleSheet } from "react-native";

import { canvasPages } from "../src/features/canvas/editor-pages";
import { PageManagerSheet } from "../src/features/canvas/page-manager-sheet";
import { colors } from "../src/components/ui";
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
      <PageManagerSheet onChange={onChange} onClose={() => undefined} onRequestAddPage={() => undefined} pages={pages} />,
    );

    fireEvent.press(screen.getByLabelText("第 1 页"));
    fireEvent.press(screen.getByLabelText("删除所选页面"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((page: StoryPage) => page.id)).toEqual(["b"]);
  });

  it("requests the photo-first add-page flow only after modal dismissal without mutating pages", () => {
    const onChange = jest.fn();
    const calls: string[] = [];
    const onClose = jest.fn(() => calls.push("close"));
    const onRequestAddPage = jest.fn(() => calls.push("request"));
    const screen = render(
      <PageManagerSheet onChange={onChange} onClose={onClose} onRequestAddPage={onRequestAddPage} pages={pages} visible />,
    );

    fireEvent.press(screen.getByLabelText("添加页面"));

    expect(calls).toEqual(["close"]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRequestAddPage).not.toHaveBeenCalled();
    screen.rerender(
      <PageManagerSheet onChange={onChange} onClose={onClose} onRequestAddPage={onRequestAddPage} pages={pages} visible={false} />,
    );
    expect(onRequestAddPage).not.toHaveBeenCalled();
    fireEvent(screen.UNSAFE_getByType(require("react-native").Modal), "dismiss");
    expect(calls).toEqual(["close", "request"]);
    expect(onRequestAddPage).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
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

  it("deletes the album from preview without changing pages or closing", () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    const onDeleteAlbum = jest.fn();
    const screen = render(
      <PageManagerSheet
        mode="preview"
        onChange={onChange}
        onClose={onClose}
        onDeleteAlbum={onDeleteAlbum}
        onJumpToPage={() => undefined}
        pages={pages}
      />,
    );

    const deleteButton = screen.getByLabelText("删除这册旅行记忆");
    const deleteLabel = screen.getByText("删除这册旅行记忆");

    expect(deleteButton.props.accessibilityRole).toBe("button");
    expect(StyleSheet.flatten(deleteLabel.props.style)).toMatchObject({ color: colors.danger });

    fireEvent.press(deleteButton);

    expect(onDeleteAlbum).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides album deletion when preview omits it and in manage mode", () => {
    const preview = render(
      <PageManagerSheet
        mode="preview"
        onClose={() => undefined}
        onJumpToPage={() => undefined}
        pages={pages}
      />,
    );

    expect(preview.queryByLabelText("删除这册旅行记忆")).toBeNull();
    preview.unmount();

    const manage = render(
      <PageManagerSheet onChange={() => undefined} onClose={() => undefined} pages={pages} />,
    );

    expect(manage.queryByLabelText("删除这册旅行记忆")).toBeNull();
  });
});
