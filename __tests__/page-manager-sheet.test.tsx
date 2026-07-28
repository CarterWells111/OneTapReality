import { fireEvent, render } from "@testing-library/react-native";
import * as React from "react";

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
    expect(onChange.mock.calls[0][0].map((page: StoryPage) => page.id)).toEqual(["a"]);
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
});
