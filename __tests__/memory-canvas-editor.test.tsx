import {
  act,
  fireEvent,
  render,
} from "@testing-library/react-native";

import {
  addCanvasPage,
  addStickerToPage,
  addTextToPage,
  deleteCanvasPage,
  duplicateCanvasElement,
  moveCanvasPage,
  toggleCanvasPhotoSelection,
  updateCanvasElement,
} from "../src/features/canvas/editor-pages";
import type { Memory, StoryPage } from "../src/types/memory";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockBack = jest.fn();
const mockDismissTo = jest.fn();
const mockUpdatePages = jest.fn();
const mockGetMemoryById = jest.fn();
let mockSearchParams: { id: string; pageId?: string; pageIndex?: string } = { id: "memory-1" };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({ back: mockBack, dismissTo: mockDismissTo }),
}));

jest.mock("../src/features/memories/memories-provider", () => ({
  useMemories: () => ({ getMemoryById: mockGetMemoryById, updatePages: mockUpdatePages }),
}));

import EditMemoryScreen from "../src/app/memory/[id]/edit";

const legacyPages: StoryPage[] = [
  {
    id: "cover-1",
    position: 0,
    kind: "cover",
    headline: "杭州周末",
    body: "西湖边的一个下午。",
    photoUri: "file://west-lake.jpg",
  },
  {
    id: "closing-1",
    position: 1,
    kind: "closing",
    headline: "下次再见",
    body: "把这一页留给下一段旅程。",
  },
];

const memory: Memory = {
  id: "memory-1",
  title: "杭州周末",
  city: "hangzhou",
  travelDate: "2026-07-22",
  photoUris: ["file://west-lake.jpg", "file://coffee.jpg"],
  pages: legacyPages,
  createdAt: "2026-07-22T10:00:00.000Z",
  updatedAt: "2026-07-22T10:00:00.000Z",
};

describe("canvas page editing model", () => {
  it("adds a square photo page, deletes one page, and keeps positions contiguous when reordering", () => {
    const withNewPage = addCanvasPage(legacyPages, ["file://coffee.jpg", "file://bridge.jpg"], "page-3");
    const reordered = moveCanvasPage(withNewPage, "page-3", "backward");
    const remaining = deleteCanvasPage(reordered, "closing-1");

    expect(withNewPage[2].layout?.elements.filter((element) => element.type === "image")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: "file://coffee.jpg" }),
        expect.objectContaining({ uri: "file://bridge.jpg" }),
      ]),
    );
    const imageLayers = withNewPage[2].layout!.elements
      .filter((element) => element.type === "image")
      .map((element) => element.zIndex);
    const textLayers = withNewPage[2].layout!.elements
      .filter((element) => element.type === "text")
      .map((element) => element.zIndex);
    expect(Math.min(...textLayers)).toBeGreaterThan(Math.max(...imageLayers));
    expect(reordered.map((page) => page.id)).toEqual(["cover-1", "page-3", "closing-1"]);
    expect(remaining.map((page) => page.position)).toEqual([0, 1]);
  });

  it("keeps text and sticker edits in the selected page layout", () => {
    const withText = addTextToPage(legacyPages, "cover-1", "text-1");
    const withSticker = addStickerToPage(withText, "cover-1", "sticker-1", "sticker1-01");
    const updated = updateCanvasElement(withSticker, "cover-1", "text-1", { color: "#A44736" });
    const duplicated = duplicateCanvasElement(updated, "cover-1", "text-1", "text-2");

    expect(updated[0].layout?.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "text-1", color: "#A44736" })]),
    );
    expect(duplicated[0].layout?.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "sticker-1", stickerId: "sticker1-01" })]),
    );
    expect(duplicated[0].layout?.elements.find((element) => element.id === "text-2")).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("does not allow more than twelve source photos on one canvas page", () => {
    const selected = Array.from({ length: 12 }, (_, index) => `file://photo-${index}.jpg`);

    expect(toggleCanvasPhotoSelection(selected, "file://photo-12.jpg")).toEqual(selected);
  });
});

describe("EditMemoryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: "memory-1", pageId: "closing-1", pageIndex: "1" };
    mockGetMemoryById.mockReturnValue(memory);
    mockUpdatePages.mockResolvedValue(undefined);
  });

  it("opens on the requested page and dismisses back to one detail route after Save", async () => {
    const screen = render(<EditMemoryScreen />);

    expect(screen.getByTestId("canvas-element-closing-1:headline")).toBeTruthy();
    expect(mockUpdatePages).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("打开页面管理"));
    fireEvent.press(screen.getByText("添加页面"));
    expect(screen.getByTestId("page-cell-2")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("完成页面管理"));
    expect(mockUpdatePages).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText("保存画布"));
    });

    expect(mockUpdatePages).toHaveBeenCalledTimes(1);
    expect(mockUpdatePages.mock.calls[0][1]).toHaveLength(3);
    expect(mockDismissTo).toHaveBeenCalledWith({
      pathname: "/memory/[id]",
      params: { id: "memory-1", pageId: "closing-1", pageIndex: "1" },
    });
    expect(mockBack).not.toHaveBeenCalled();
  });
});
