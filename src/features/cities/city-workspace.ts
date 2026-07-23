import type { City } from "../../types/memory";
import type { CityMapAdapter, CityMapFocus } from "./city-map-adapter";

export type WorkspaceViewport = {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
};

export type WorkspaceSize = {
  readonly height: number;
  readonly width: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

export function clampWorkspaceViewport(viewport: WorkspaceViewport, size: WorkspaceSize): WorkspaceViewport {
  const scale = clamp(viewport.scale, 1, 3.5);
  const translateXLimit = Math.max(0, (size.width * (scale - 1)) / 2);
  const translateYLimit = Math.max(0, (size.height * (scale - 1)) / 2);

  const translateX = clamp(viewport.translateX, -translateXLimit, translateXLimit);
  const translateY = clamp(viewport.translateY, -translateYLimit, translateYLimit);
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
