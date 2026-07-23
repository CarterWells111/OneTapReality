import {
  canvasStickerCategories,
  getCanvasStickers,
} from "../src/features/canvas/canvas-assets";

describe("canvas sticker categories", () => {
  it("exposes All plus the four local sticker categories", () => {
    expect(canvasStickerCategories.map((category) => category.label)).toEqual([
      "全部",
      "情感",
      "旅行",
      "日常",
      "自然",
    ]);
  });

  it("returns the expected local sticker metadata per category", () => {
    expect(getCanvasStickers("emotion").map((sticker) => sticker.id)).toEqual([
      "heart",
      "sparkles",
      "love-letter",
    ]);
    expect(getCanvasStickers("travel").map((sticker) => sticker.id)).toEqual([
      "camera",
      "suitcase",
      "map",
      "pin",
      "ticket",
    ]);
    expect(getCanvasStickers("daily").map((sticker) => sticker.id)).toEqual(["coffee"]);
    expect(getCanvasStickers("nature").map((sticker) => sticker.id)).toEqual([
      "flower",
      "sun",
      "moon",
    ]);
    expect(getCanvasStickers("all")).toHaveLength(12);
  });
});
