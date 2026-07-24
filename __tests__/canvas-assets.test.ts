import {
  canvasBackgrounds,
  canvasStickerCategories,
  getCanvasStickers,
} from "../src/features/canvas/canvas-assets";

describe("canvas sticker categories", () => {
  it("exposes All plus the four local sticker categories", () => {
    expect(canvasStickerCategories.map((category) => category.label)).toEqual([
      "全部",
      "贴纸 1",
      "贴纸 2",
      "贴纸 3",
      "贴纸 4",
    ]);
  });

  it("returns the expected local sticker metadata per category", () => {
    expect(getCanvasStickers("sticker1")).toHaveLength(20);
    expect(getCanvasStickers("sticker2")).toHaveLength(20);
    expect(getCanvasStickers("sticker3")).toHaveLength(20);
    expect(getCanvasStickers("sticker4")).toHaveLength(20);
    expect(getCanvasStickers("all")).toHaveLength(80);
  });

  it("exposes local background metadata", () => {
    expect(canvasBackgrounds).toHaveLength(40);
    expect(canvasBackgrounds[0]).toEqual(expect.objectContaining({
      id: "background-01",
      label: "背景 01",
    }));
  });
});
