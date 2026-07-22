import { calculateCanvasTransform } from "../src/features/canvas/canvas-element";

describe("calculateCanvasTransform", () => {
  it("commits pan, scale, and rotation together from the element center", () => {
    const result = calculateCanvasTransform(
      { x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0 },
      { translationX: 20, translationY: 0, scale: 2, rotation: 0.3 },
      200,
    );

    expect(result).toEqual({ x: 0, y: 0, width: 0.8, height: 0.4, rotation: 0.3 });
  });
});
