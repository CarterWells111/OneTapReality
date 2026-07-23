import type { City } from "../../types/memory";

export type RelativeMapCoordinate = {
  readonly x: number;
  readonly y: number;
};

export type LocalMapOutline = {
  id: "china-simplified";
  coordinateSpace: "relative";
  points: readonly RelativeMapCoordinate[];
};

export type CityMapMarker = {
  readonly city: City;
  readonly coordinate: RelativeMapCoordinate;
};

export type CityMapFocus = {
  readonly center: RelativeMapCoordinate;
  readonly zoom: number;
};

export interface CityMapAdapter {
  readonly outline: LocalMapOutline;
  readonly markers: readonly CityMapMarker[];
  readonly initialFocus: CityMapFocus;
  readonly cityFocus: Readonly<Record<City, CityMapFocus>>;
}

function freezeCoordinate({ x, y }: RelativeMapCoordinate): RelativeMapCoordinate {
  return Object.freeze({ x, y });
}

const chinaOutline: LocalMapOutline = Object.freeze({
  id: "china-simplified",
  coordinateSpace: "relative",
  points: Object.freeze([
    freezeCoordinate({ x: 0.14, y: 0.25 }),
    freezeCoordinate({ x: 0.31, y: 0.12 }),
    freezeCoordinate({ x: 0.53, y: 0.17 }),
    freezeCoordinate({ x: 0.77, y: 0.12 }),
    freezeCoordinate({ x: 0.89, y: 0.27 }),
    freezeCoordinate({ x: 0.83, y: 0.43 }),
    freezeCoordinate({ x: 0.91, y: 0.57 }),
    freezeCoordinate({ x: 0.77, y: 0.68 }),
    freezeCoordinate({ x: 0.65, y: 0.85 }),
    freezeCoordinate({ x: 0.45, y: 0.78 }),
    freezeCoordinate({ x: 0.32, y: 0.66 }),
    freezeCoordinate({ x: 0.17, y: 0.58 }),
    freezeCoordinate({ x: 0.09, y: 0.42 }),
  ]),
});

const cityMarkers: readonly CityMapMarker[] = Object.freeze([
  Object.freeze({ city: "hangzhou" as const, coordinate: freezeCoordinate({ x: 0.73, y: 0.47 }) }),
  Object.freeze({ city: "shanghai" as const, coordinate: freezeCoordinate({ x: 0.78, y: 0.42 }) }),
  Object.freeze({ city: "shenzhen" as const, coordinate: freezeCoordinate({ x: 0.62, y: 0.77 }) }),
]);

export class OfflineChinaMapAdapter implements CityMapAdapter {
  readonly outline = chinaOutline;
  readonly markers = cityMarkers;
  readonly initialFocus: CityMapFocus = Object.freeze({
    center: freezeCoordinate({ x: 0.62, y: 0.53 }),
    zoom: 1,
  });
  readonly cityFocus: Readonly<Record<City, CityMapFocus>> = Object.freeze({
    hangzhou: Object.freeze({ center: freezeCoordinate({ x: 0.73, y: 0.47 }), zoom: 2 }),
    shanghai: Object.freeze({ center: freezeCoordinate({ x: 0.78, y: 0.42 }), zoom: 2 }),
    shenzhen: Object.freeze({ center: freezeCoordinate({ x: 0.62, y: 0.77 }), zoom: 2 }),
  });
}
