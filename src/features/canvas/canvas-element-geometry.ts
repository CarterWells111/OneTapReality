import type { CanvasElement } from "../../types/memory";

export type CanvasDimensions = { width: number; height: number };

export type CanvasElementGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const finiteCanvasSize = (value: number) =>
  Number.isFinite(value) && value >= 0 ? value : 0;

const finiteProduct = (left: number, right: number) => {
  const product = finiteOr(left * right, 0);
  return Object.is(product, -0) ? 0 : product;
};

/** Resolve persisted normalized geometry into native-safe pixel values. */
export function resolveCanvasElementGeometry(
  element: Pick<CanvasElement, "x" | "y" | "width" | "height" | "rotation" | "zIndex">,
  canvasDimensions: CanvasDimensions,
): CanvasElementGeometry {
  const canvasWidth = finiteCanvasSize(canvasDimensions.width);
  const canvasHeight = finiteCanvasSize(canvasDimensions.height);

  return {
    left: finiteProduct(clamp(finiteOr(element.x, 0), -0.95, 0.95), canvasWidth),
    top: finiteProduct(clamp(finiteOr(element.y, 0), -0.95, 0.95), canvasHeight),
    width: finiteProduct(clamp(finiteOr(element.width, 0.03), 0.03, 1), canvasWidth),
    height: finiteProduct(clamp(finiteOr(element.height, 0.03), 0.03, 1), canvasHeight),
    rotation: finiteOr(element.rotation, 0),
    zIndex: finiteOr(element.zIndex, 0),
  };
}
