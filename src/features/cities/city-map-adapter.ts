import type { City } from "../../types/memory";

export type RelativeMapCoordinate = {
  x: number;
  y: number;
};

export type LocalMapOutline = {
  id: "china-simplified";
  coordinateSpace: "relative";
  points: readonly RelativeMapCoordinate[];
};

export type CityMapMarker = {
  city: City;
  coordinate: RelativeMapCoordinate;
};

export type CityMapFocus = {
  center: RelativeMapCoordinate;
  zoom: number;
};

export interface CityMapAdapter {
  readonly outline: LocalMapOutline;
  readonly markers: readonly CityMapMarker[];
  readonly initialFocus: CityMapFocus;
}

const chinaOutline: LocalMapOutline = {
  id: "china-simplified",
  coordinateSpace: "relative",
  points: [
    { x: 0.14, y: 0.25 },
    { x: 0.31, y: 0.12 },
    { x: 0.53, y: 0.17 },
    { x: 0.77, y: 0.12 },
    { x: 0.89, y: 0.27 },
    { x: 0.83, y: 0.43 },
    { x: 0.91, y: 0.57 },
    { x: 0.77, y: 0.68 },
    { x: 0.65, y: 0.85 },
    { x: 0.45, y: 0.78 },
    { x: 0.32, y: 0.66 },
    { x: 0.17, y: 0.58 },
    { x: 0.09, y: 0.42 },
  ],
};

const cityMarkers: readonly CityMapMarker[] = [
  { city: "hangzhou", coordinate: { x: 0.73, y: 0.47 } },
  { city: "shanghai", coordinate: { x: 0.78, y: 0.42 } },
  { city: "shenzhen", coordinate: { x: 0.62, y: 0.77 } },
];

export class OfflineChinaMapAdapter implements CityMapAdapter {
  readonly outline = chinaOutline;
  readonly markers = cityMarkers;
  readonly initialFocus: CityMapFocus = { center: { x: 0.62, y: 0.53 }, zoom: 1 };
}
