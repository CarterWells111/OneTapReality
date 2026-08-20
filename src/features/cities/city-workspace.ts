import type { City } from "../../types/memory";
import type { CityMapAdapter, CityMapFocus } from "./city-map-adapter";
import { chinaMapViewBox } from "./china-map-data";

export type WorkspaceViewport = {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
};

export type WorkspaceSize = {
  readonly height: number;
  readonly width: number;
};

export const workspaceMinScale = 1;
export const workspaceMaxScale = 6;
export const workspacePanOverscanRatio = 0.5;

const clamp = (value: number, minimum: number, maximum: number) => {
  "worklet";
  return Math.min(Math.max(value, minimum), maximum);
};

const [, , chinaMapWidth, chinaMapHeight] = chinaMapViewBox.split(/\s+/).map(Number);

export function getWorkspaceTranslationLimits(scale: number, size: WorkspaceSize) {
  "worklet";
  const boundedScale = clamp(scale, workspaceMinScale, workspaceMaxScale);
  const contentScale = Math.min(size.width / chinaMapWidth, size.height / chinaMapHeight);
  const contentWidth = chinaMapWidth * contentScale;
  const contentHeight = chinaMapHeight * contentScale;
  return {
    x: Math.max(0, (contentWidth * boundedScale - size.width) / 2) + size.width * workspacePanOverscanRatio,
    y: Math.max(0, (contentHeight * boundedScale - size.height) / 2) + size.height * workspacePanOverscanRatio,
  };
}

export function clampWorkspaceViewport(viewport: WorkspaceViewport, size: WorkspaceSize): WorkspaceViewport {
  "worklet";
  const scale = clamp(viewport.scale, workspaceMinScale, workspaceMaxScale);
  const limits = getWorkspaceTranslationLimits(scale, size);

  const translateX = clamp(viewport.translateX, -limits.x, limits.x);
  const translateY = clamp(viewport.translateY, -limits.y, limits.y);
  return {
    scale,
    translateX: translateX === 0 ? 0 : translateX,
    translateY: translateY === 0 ? 0 : translateY,
  };
}

export function resolveCityFocus(adapter: CityMapAdapter, city: City): CityMapFocus {
  return adapter.cityFocus[city];
}

export function reorderCityMemoryIds(memoryIds: readonly string[], memoryId: string, destinationIndex: number): string[] {
  const sourceIndex = memoryIds.indexOf(memoryId);
  if (sourceIndex === -1) return [...memoryIds];

  const next = [...memoryIds];
  next.splice(sourceIndex, 1);
  next.splice(clamp(destinationIndex, 0, next.length), 0, memoryId);
  return next;
}

export function getCityWorkspaceLayout(width: number) {
  return width >= 720
    ? { collectionFlex: 55, direction: "row" as const, mapFlex: 45 }
    : { collectionFlex: undefined, direction: "column" as const, mapFlex: undefined };
}
