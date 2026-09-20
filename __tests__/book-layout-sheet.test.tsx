import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { BookLayoutSheet } from "../src/features/canvas/book-layout-sheet";
import { createBookLayoutDraft } from "../src/features/canvas/book-layout-draft";
import type { CanvasLayout, StoryPage } from "../src/types/memory";

let mockPreviewLayout: CanvasLayout;
jest.mock("../src/features/canvas/canvas-page", () => ({
  CanvasPage: ({ layout }: { layout: CanvasLayout }) => { mockPreviewLayout = layout; return null; },
}));
it("previews reordered cropped photos and templates before applying", () => {
  const pages: StoryPage[] = [{ id: "p", position: 0, kind: "photo", headline: "", body: "", layout: { aspectRatio: 0.75, elements: [
    { id: "one", type: "image", uri: "same.jpg", x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0, zIndex: 1, crop: { focusX: 0.2, focusY: 0.4, zoom: 2 } },
    { id: "two", type: "image", uri: "same.jpg", x: 0.6, y: 0.1, width: 0.2, height: 0.2, rotation: 0, zIndex: 2 },
  ] } }];
  const onApply = jest.fn(() => true);
  const screen = render(<BookLayoutSheet draft={createBookLayoutDraft(pages)} onApply={onApply} onCancel={jest.fn()} />);
  expect(screen.getByTestId("book-layout-preview")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("槽位 1 的照片后移"));
  expect(mockPreviewLayout.elements[0]).toMatchObject({ id: "two", x: 0.1 });
  expect(mockPreviewLayout.elements[1]).toMatchObject({ id: "one", x: 0.6, crop: { zoom: 2 } });
  fireEvent.press(screen.getByLabelText("经典留白双图模板"));
  expect(mockPreviewLayout.photoTemplateId).toBe("classic-2");
  expect(onApply).not.toHaveBeenCalled();
});
