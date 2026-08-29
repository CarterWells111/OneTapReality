import { fireEvent, render, screen } from "@testing-library/react-native";
import type { CanvasLayout } from "../src/types/memory";

const mockCanvasPage = jest.fn((props: { layout: unknown }) => {
  const React = require("react");
  const { Text } = require("react-native");
  return <Text testID="cover-canvas">{JSON.stringify(props.layout)}</Text>;
});
const mockResolveCanvasPreviewContentScale = jest.fn((_displayWidth: number, _viewportWidth: number) => 0.5);

jest.mock("../src/features/canvas/canvas-page", () => ({ CanvasPage: (props: { layout: unknown }) => mockCanvasPage(props) }));
jest.mock("../src/features/canvas/canvas-display-metrics", () => ({
  resolveCanvasPreviewContentScale: (...args: [number, number]) => mockResolveCanvasPreviewContentScale(...args),
}));

import { MemoryBookCover } from "../src/components/memory-book-cover";

describe("MemoryBookCover", () => {
  it("renders the exact first-page canvas layout without a duplicate cover template", () => {
    const firstPageLayout = {
      aspectRatio: 0.75,
      backgroundId: "paper-1",
      elements: [{ id: "title", type: "text", text: "真实封面", fontStyle: "body", color: "#111111", fontSize: 22, x: 0.1, y: 0.2, width: 0.8, height: 0.2, rotation: 0, zIndex: 1 }],
    } satisfies CanvasLayout;
    render(<MemoryBookCover memory={{
      id: "memory-a",
      title: "顶层旧标题",
      city: "hangzhou",
      travelDate: "2026-08-16",
      photoUris: [],
      pages: [{ id: "cover", position: 0, kind: "cover", headline: "真实封面", body: "", layout: firstPageLayout }],
      createdAt: "2026-08-16T10:00:00.000Z",
      updatedAt: "2026-08-16T10:00:00.000Z",
    }} onPress={jest.fn()} />);

    expect(screen.getByTestId("cover-canvas")).toBeTruthy();
    fireEvent(screen.getByRole("button", { name: "打开旅行册 顶层旧标题" }), "layout", {
      nativeEvent: { layout: { width: 175 } },
    });

    expect(mockResolveCanvasPreviewContentScale).toHaveBeenLastCalledWith(175, expect.any(Number));
    expect(mockCanvasPage).toHaveBeenLastCalledWith(expect.objectContaining({
      contentScale: 0.5,
      height: (175 * 4) / 3,
      interactive: false,
      layout: firstPageLayout,
      width: 175,
    }));
    expect(screen.queryByText("顶层旧标题")).toBeNull();
  });
});
