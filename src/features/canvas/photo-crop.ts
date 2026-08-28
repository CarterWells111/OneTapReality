import type { PhotoCropState } from "../../types/memory";

export const DEFAULT_PHOTO_CROP: PhotoCropState = Object.freeze({
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
});

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizePhotoCropState(value: unknown): PhotoCropState {
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
