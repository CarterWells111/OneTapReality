import { calculateCanvasTransform, calculateStickerTextStyle } from "../src/features/canvas/canvas-element";

describe("calculateCanvasTransform", () => {
  it("commits pan, scale, and rotation together from the element center", () => {
    const result = calculateCanvasTransform(
      { x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0 },
      { translationX: 20, translationY: 0, scale: 2, rotation: 0.3 },
      200,
    );

    expect(result).toEqual({ x: 0, y: 0, width: 0.8, height: 0.4, rotation: 0.3 });
  });

  it("normalizes horizontal and vertical movement against a 3:4 page independently", () => {
    const result = calculateCanvasTransform(
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
      { translationX: 30, translationY: 40, scale: 1, rotation: 0 },
      { width: 300, height: 400 },
    );

    expect(result).toEqual({ x: 0.2, y: 0.2, width: 0.2, height: 0.2, rotation: 0 });
  });

  it("scales a sticker glyph with its persisted element size", () => {
    expect(calculateStickerTextStyle({ width: 0.14, height: 0.14 }, { width: 300, height: 400 }))
      .toEqual({ fontSize: 34, lineHeight: 40 });
    expect(calculateStickerTextStyle({ width: 0.28, height: 0.28 }, { width: 300, height: 400 }))
      .toEqual({ fontSize: 68, lineHeight: 80 });
  });
});
