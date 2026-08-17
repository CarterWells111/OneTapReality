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

  it("preserves accepted normalized overhang during a no-op rotation commit", () => {
    const result = calculateCanvasTransformFromAbsolute(
      { x: 0.9, y: -0.9, width: 0.2, height: 0.2, rotation: 0 } as any,
      270, -360, 60, 80, 0.4,
      { width: 300, height: 400 },
    );

    expect(result).toMatchObject({ x: 0.9, y: -0.9, rotation: 0.4 });
  });

  it("preserves a full-bleed frame during a no-op commit", () => {
    const result = calculateCanvasTransformFromAbsolute(
      { x: 0, y: 0, width: 1, height: 1, rotation: 0 } as any,
      0, 0, 300, 400, 0,
      { width: 300, height: 400 },
    );

    expect(result).toMatchObject({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("returns the finite persisted frame when canvas dimensions cannot be divided", () => {
    const element = { x: 0.9, y: -0.9, width: 0.2, height: 0.3, rotation: 0.4 } as any;

    for (const dimensions of [
      { width: 0, height: 0 },
      { width: Number.NaN, height: Number.POSITIVE_INFINITY },
    ]) {
      const result = calculateCanvasTransformFromAbsolute(
        element,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        dimensions,
      );

      expect(result).toMatchObject(element);
      expect(Object.values(result).every((value) => typeof value === "number" && Number.isFinite(value))).toBe(true);
    }
  });

  it("preserves a finite full-bleed persisted frame when canvas dimensions are invalid", () => {
    const element = { x: 0, y: 0, width: 1, height: 1, rotation: 0 } as any;

    for (const dimensions of [
      { width: 0, height: 0 },
      { width: Number.NaN, height: Number.POSITIVE_INFINITY },
    ]) {
      const result = calculateCanvasTransformFromAbsolute(
        element,
        Number.NaN,
        Number.NaN,
        Number.NaN,
        Number.NaN,
        Number.NaN,
        dimensions,
      );

      expect(result).toMatchObject({ width: 1, height: 1 });
      expect(Object.values(result).every((value) => typeof value === "number" && Number.isFinite(value))).toBe(true);
    }
  });

  it("does not emit an invalid font size from a corrupt text element during a valid scale", () => {
    const result = calculateCanvasTransformFromAbsolute(
      { x: 0, y: 0, width: 0.2, height: 0.2, rotation: 0, type: "text", fontSize: Number.NaN } as any,
      0, 0, 120, 80, 0,
      { width: 300, height: 400 },
      2,
    );

    expect(result.fontSize).toBe(32);
    expect(Object.values(result).every((value) => typeof value === "number" && Number.isFinite(value))).toBe(true);
  });

  it("scales a sticker glyph with its persisted element size", () => {
    expect(calculateStickerTextStyle({ width: 0.14, height: 0.14 }, { width: 300, height: 400 }))
      .toEqual({ fontSize: 34, lineHeight: 40 });
    expect(calculateStickerTextStyle({ width: 0.28, height: 0.28 }, { width: 300, height: 400 }))
      .toEqual({ fontSize: 68, lineHeight: 80 });
  });
});
