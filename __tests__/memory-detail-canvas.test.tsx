import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

const mockGetMemoryById = jest.fn();
const mockPush = jest.fn();
const mockShare = jest.fn();

jest.mock("expo-router", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Stack: {
      Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => (
        <View>{options?.headerRight ? options.headerRight() : null}</View>
      ),
    },
    useLocalSearchParams: () => ({ id: "memory-canvas" }),
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  };
});

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ deleteMemory: jest.fn(), getMemoryById: mockGetMemoryById }),
}));

jest.mock("../src/features/export/share-action-sheet", () => ({ showShareActionSheet: (...args: unknown[]) => mockShare(...args) }));

import MemoryDetailScreen from "../src/app/memory/[id]";

describe("MemoryDetailScreen canvas rendering", () => {
  beforeEach(() => jest.clearAllMocks());
  it("renders saved canvas layouts and keeps the page heading available", async () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas",
      title: "上海之夜",
      city: "shanghai",
      travelDate: "2026-07-22",
      photoUris: ["file://bund.jpg"],
      createdAt: "2026-07-22T10:00:00.000Z",
      updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [
        {
          id: "cover",
          position: 0,
          kind: "cover",
          headline: "外滩的风",
          body: "我们散步到很晚。",
          layout: {
            aspectRatio: 1,
            elements: [
              { id: "title", type: "text", text: "外滩的风", fontStyle: "avenir", color: "#1C2C28", x: 0.1, y: 0.2, width: 0.8, height: 0.1, rotation: 0.25, zIndex: 1 },
            ],
          },
        },
      ],
    });

    const screen = await render(<MemoryDetailScreen />);

    expect(screen.getByText("上海之夜")).toBeTruthy();
    expect(screen.getByTestId("album-canvas")).toBeTruthy();
    expect(screen.getByText("外滩的风")).toBeTruthy();
    const canvasStyle = StyleSheet.flatten(screen.getByTestId("album-canvas").props.style);
    expect(canvasStyle.height / canvasStyle.width).toBeCloseTo(4 / 3);
    expect(StyleSheet.flatten(screen.getByTestId("canvas-element-title").props.style)).toMatchObject({
      transform: [{ rotate: "0.25rad" }],
    });
  });

  it("shows explicit local edit, share, and gift binding actions without consulting shared roles", () => {
    mockGetMemoryById.mockReturnValue({
      id: "memory-canvas", title: "Local album", city: "shanghai", travelDate: "2026-07-22", photoUris: [],
      createdAt: "2026-07-22T10:00:00.000Z", updatedAt: "2026-07-22T10:00:00.000Z",
      pages: [{ id: "cover", position: 0, kind: "cover", headline: "Cover", body: "", layout: { aspectRatio: 0.75, elements: [] } }],
    });
    const view = render(<MemoryDetailScreen />);

    fireEvent.press(view.getByText("编辑相册"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/memory/[id]/edit", params: { id: "memory-canvas" } });
    fireEvent.press(view.getByText("分享相册"));
    expect(mockShare).toHaveBeenCalled();
    fireEvent.press(view.getByText("绑定到礼品"));
    expect(mockPush).toHaveBeenCalledWith("/gifts?memoryId=memory-canvas");
  });
});
