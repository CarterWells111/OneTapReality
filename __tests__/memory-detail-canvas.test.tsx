import { render } from "@testing-library/react-native";

const mockGetMemoryById = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "memory-canvas" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ deleteMemory: jest.fn(), getMemoryById: mockGetMemoryById }),
}));

import MemoryDetailScreen from "../src/app/memory/[id]";

describe("MemoryDetailScreen canvas rendering", () => {
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
              { id: "title", type: "text", text: "外滩的风", fontStyle: "avenir", color: "#1C2C28", x: 0.1, y: 0.2, width: 0.8, height: 0.1, rotation: 0, zIndex: 1 },
            ],
          },
        },
      ],
    });

    const screen = await render(<MemoryDetailScreen />);

    expect(screen.getByText("上海之夜")).toBeTruthy();
    expect(screen.getByTestId("album-canvas")).toBeTruthy();
    expect(screen.getByText("外滩的风")).toBeTruthy();
  });
});
