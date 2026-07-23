import { cities, type City } from "../../types/memory";

export function resolveCityRouteParam(value: string | undefined): City {
  return cities.includes(value as City) ? (value as City) : "hangzhou";
}
