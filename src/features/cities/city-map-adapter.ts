import { cityRegistry, type City, type CityMapFocus, type RelativeMapCoordinate } from "../../types/city";
import { chinaMapMarkers } from "./china-map-data";

export type { CityMapFocus, RelativeMapCoordinate } from "../../types/city";

export type LocalMapOutline = {
  id: "china-simplified";
  coordinateSpace: "relative";
  points: readonly RelativeMapCoordinate[];
};

export type CityMapMarker = {
  readonly city: City;
  readonly coordinate: RelativeMapCoordinate;
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

/** 城市标记坐标：由真实经纬度经 Albers 投影归一化得到（见 china-map-data.ts）。 */
const cityMarkers: readonly CityMapMarker[] = Object.freeze(
  cityRegistry.map((city) => {
    const projected = chinaMapMarkers.find((marker) => marker.city === city.id);
    return Object.freeze({
      city: city.id,
      coordinate: projected
        ? freezeCoordinate({ x: projected.x, y: projected.y })
        : city.coordinate,
    });
  }),
);
// 搜索跳转的中心点必须与标记坐标同一体系（投影后 0..1），否则跳转会定位到错误位置
const cityFocus: Readonly<Record<City, CityMapFocus>> = Object.freeze(Object.fromEntries(
  cityMarkers.map((marker) => [marker.city, Object.freeze({ center: marker.coordinate, zoom: 2 })]),
) as Record<City, CityMapFocus>);

export class OfflineChinaMapAdapter implements CityMapAdapter {
  readonly outline = chinaOutline;
  readonly markers = cityMarkers;
  readonly initialFocus: CityMapFocus = Object.freeze({
    center: freezeCoordinate({ x: 0.52, y: 0.42 }),
    zoom: 1,
  });
  readonly cityFocus = cityFocus;
}
