import { calculateCanvasTransformFromAbsolute, calculateStickerTextStyle } from "../src/features/canvas/canvas-element";

describe("calculateCanvasTransformFromAbsolute", () => {
  it("computes patch from absolute pixel positions", () => {
    const result = calculateCanvasTransformFromAbsolute(
      { x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0 } as any,
      0, 0, 160, 80, 0.3,
      { width: 200, height: 200 },
    );

    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(0.8);
    expect(result.height).toBe(0.4);
    expect(result.rotation).toBe(0.3);
  });

  it("normalizes horizontal and vertical movement against a 3:4 page independently", () => {
    const result = calculateCanvasTransformFromAbsolute(
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 } as any,
      60, 80, 60, 80, 0,
      { width: 300, height: 400 },
    );

    expect(result.x).toBe(0.2);
    expect(result.y).toBe(0.2);
    expect(result.width).toBe(0.2);
    expect(result.height).toBe(0.2);
    expect(result.rotation).toBe(0);
  });

  it("scales a sticker glyph with its persisted element size", () => {
    expect(calculateStickerTextStyle({ width: 0.14, height: 0.14 }, { width: 300, height: 400 }))
      .toEqual({ fontSize: 34, lineHeight: 40 });
    expect(calculateStickerTextStyle({ width: 0.28, height: 0.28 }, { width: 300, height: 400 }))
      .toEqual({ fontSize: 68, lineHeight: 80 });
  });
});
