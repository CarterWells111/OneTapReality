const CANVAS_VIEWPORT_INSET = 40;
const MIN_CANVAS_PAGE_WIDTH = 280;
const MAX_CANVAS_PAGE_WIDTH = 360;

export function resolveCanvasPageWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) {
    return MIN_CANVAS_PAGE_WIDTH;
  }

  return Math.min(
    MAX_CANVAS_PAGE_WIDTH,
    Math.max(MIN_CANVAS_PAGE_WIDTH, viewportWidth - CANVAS_VIEWPORT_INSET),
  );
}

export function resolveCanvasPreviewContentScale(
  displayWidth: number,
  viewportWidth: number,
): number {
  if (!Number.isFinite(displayWidth) || displayWidth <= 0) {
    return 1;
  }

  return displayWidth / resolveCanvasPageWidth(viewportWidth);
}
