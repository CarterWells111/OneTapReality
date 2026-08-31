import {
  canvasBackgrounds,
  canvasStickerCategories,
  getCanvasStickers,
} from "../src/features/canvas/canvas-assets";

describe("canvas sticker categories", () => {
  it("exposes useful named sticker themes in addition to legacy local categories", () => {
    expect(canvasStickerCategories.map((category) => category.label)).toEqual([
      "全部",
      "贴纸 1",
      "贴纸 2",
      "贴纸 3",
      "贴纸 4",
      "旅行",
      "自然",
      "心情",
    ]);
  });

  it("returns the expected local sticker metadata per category", () => {
    expect(getCanvasStickers("sticker1")).toHaveLength(20);
    expect(getCanvasStickers("sticker2")).toHaveLength(20);
    expect(getCanvasStickers("sticker3")).toHaveLength(20);
    expect(getCanvasStickers("sticker4")).toHaveLength(20);
    expect(getCanvasStickers("travel")).toHaveLength(2);
    expect(getCanvasStickers("nature")).toHaveLength(2);
    expect(getCanvasStickers("mood")).toHaveLength(2);
    expect(getCanvasStickers("all")).toHaveLength(86);
  });

  it("exposes local background metadata", () => {
    expect(canvasBackgrounds).toHaveLength(40);
    expect(canvasBackgrounds[0]).toEqual(expect.objectContaining({
      id: "background-01",
      label: "背景 01",
    }));
  });
});
