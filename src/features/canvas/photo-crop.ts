import type { PhotoCropState } from "../../types/memory";

export const DEFAULT_PHOTO_CROP: PhotoCropState = Object.freeze({
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
});

const clamp = (value: number, minimum: number, maximum: number) => {
  "worklet";
  return Math.min(Math.max(value, minimum), maximum);
};

function isFiniteNumber(value: unknown): value is number {
  "worklet";
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizePhotoCropState(value: unknown): PhotoCropState {
  "worklet";
  if (!value || typeof value !== "object") return { ...DEFAULT_PHOTO_CROP };
  const candidate = value as Partial<PhotoCropState>;
  if (!isFiniteNumber(candidate.focusX) || !isFiniteNumber(candidate.focusY) || !isFiniteNumber(candidate.zoom)) {
    return { ...DEFAULT_PHOTO_CROP };
  }
  return {
    focusX: clamp(candidate.focusX, 0, 1),
    focusY: clamp(candidate.focusY, 0, 1),
    zoom: clamp(candidate.zoom, 1, 4),
  };
}

export type PhotoCropGeometryInput = {
  crop?: PhotoCropState;
  sourceHeight: number;
  sourceWidth: number;
  viewportHeight: number;
  viewportWidth: number;
};

export type PhotoCropGeometry = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type PhotoCropPan = {
  sourceHeight?: number;
  sourceWidth?: number;
  translationX: number;
  translationY: number;
  viewportHeight: number;
  viewportWidth: number;
};

export function panPhotoCrop(crop: PhotoCropState, pan: PhotoCropPan): PhotoCropState {
  "worklet";
  const normalized = normalizePhotoCropState(crop);
  if (pan.viewportWidth <= 0 || pan.viewportHeight <= 0) return normalized;
  if (
    isFiniteNumber(pan.sourceWidth)
    && pan.sourceWidth > 0
    && isFiniteNumber(pan.sourceHeight)
    && pan.sourceHeight > 0
  ) {
    const baseScale = Math.max(
      pan.viewportWidth / pan.sourceWidth,
      pan.viewportHeight / pan.sourceHeight,
    );
    const renderedWidth = pan.sourceWidth * baseScale * normalized.zoom;
    const renderedHeight = pan.sourceHeight * baseScale * normalized.zoom;
    const startLeft = clamp(
      (pan.viewportWidth / 2) - (normalized.focusX * renderedWidth),
      pan.viewportWidth - renderedWidth,
      0,
    );
    const startTop = clamp(
      (pan.viewportHeight / 2) - (normalized.focusY * renderedHeight),
      pan.viewportHeight - renderedHeight,
      0,
    );
    const nextLeft = clamp(startLeft + pan.translationX, pan.viewportWidth - renderedWidth, 0);
    const nextTop = clamp(startTop + pan.translationY, pan.viewportHeight - renderedHeight, 0);
    return normalizePhotoCropState({
      focusX: ((pan.viewportWidth / 2) - nextLeft) / renderedWidth,
      focusY: ((pan.viewportHeight / 2) - nextTop) / renderedHeight,
      zoom: normalized.zoom,
    });
  }
  return normalizePhotoCropState({
    focusX: normalized.focusX - (pan.translationX / (pan.viewportWidth * normalized.zoom)),
    focusY: normalized.focusY - (pan.translationY / (pan.viewportHeight * normalized.zoom)),
    zoom: normalized.zoom,
  });
}

export function zoomPhotoCrop(crop: PhotoCropState, scale: number): PhotoCropState {
  const normalized = normalizePhotoCropState(crop);
  return normalizePhotoCropState({ ...normalized, zoom: normalized.zoom * scale });
}

export function resolvePhotoCropGeometry({
  crop,
  sourceHeight,
  sourceWidth,
  viewportHeight,
  viewportWidth,
}: PhotoCropGeometryInput): PhotoCropGeometry {
  if (sourceWidth <= 0 || sourceHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { height: viewportHeight, left: 0, top: 0, width: viewportWidth };
  }
  const normalized = normalizePhotoCropState(crop);
  const baseScale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const width = sourceWidth * baseScale * normalized.zoom;
  const height = sourceHeight * baseScale * normalized.zoom;
  const left = clamp((viewportWidth / 2) - (normalized.focusX * width), viewportWidth - width, 0);
  const top = clamp((viewportHeight / 2) - (normalized.focusY * height), viewportHeight - height, 0);
  return { height, left, top, width };
}
