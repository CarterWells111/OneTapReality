import { resolveCanvasElementGeometry } from "../src/features/canvas/canvas-element-geometry";
import type { CanvasImageElement } from "../src/types/memory";

const element: CanvasImageElement = {
  id: "photo-1",
  type: "image",
  uri: "file://lake.jpg",
  x: -0.2,
  y: 0.25,
  width: 0.5,
  height: 0.3,
  rotation: 0.42,
  zIndex: 7,
};

describe("resolveCanvasElementGeometry", () => {
  it("maps normalized geometry to the saved pixel frame without moving finite out-of-bounds positions", () => {
    expect(resolveCanvasElementGeometry(element, { width: 300, height: 400 })).toEqual({
      left: -60,
      top: 100,
      width: 150,
      height: 120,
      rotation: 0.42,
      zIndex: 7,
    });
  });

  it("preserves valid full-bleed dimensions", () => {
    expect(resolveCanvasElementGeometry(
      { ...element, x: 0, y: 0, width: 1, height: 1 },
      { width: 300, height: 400 },
    )).toMatchObject({ left: 0, top: 0, width: 300, height: 400 });
  });

  it("uses normalized fallbacks and keeps every native style value finite when persisted values are invalid", () => {
    const geometry = resolveCanvasElementGeometry(
      {
        ...element,
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        width: Number.NEGATIVE_INFINITY,
        height: Number.NaN,
        rotation: Number.POSITIVE_INFINITY,
        zIndex: Number.NaN,
      },
      { width: 300, height: 400 },
    );

    expect(geometry).toEqual({
      left: 0,
      top: 0,
      width: 9,
      height: 12,
      rotation: 0,
      zIndex: 0,
    });
    expect(Object.values(geometry).every(Number.isFinite)).toBe(true);
  });

  it("applies the existing layout bounds to finite but corrupt normalized values", () => {
    const geometry = resolveCanvasElementGeometry(
      { ...element, x: -2, y: 2, width: -1, height: 3 },
      { width: 300, height: 400 },
    );

    expect(geometry).toMatchObject({
      left: -285,
      top: 380,
      width: 9,
      height: 400,
    });
  });

  it("falls back to a zero-sized canvas when canvas dimensions are not finite", () => {
    const geometry = resolveCanvasElementGeometry(
      element,
      { width: Number.POSITIVE_INFINITY, height: Number.NaN },
    );

    expect(geometry).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      rotation: 0.42,
      zIndex: 7,
    });
    expect(Object.values(geometry).every(Number.isFinite)).toBe(true);
  });
});
