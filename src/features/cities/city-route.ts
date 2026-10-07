import { resolveCityEntry, type City } from "../../types/city";

export function resolveCityRouteParam(value: string | undefined): City {
  return resolveCityEntry(value) ? value! : "hangzhou";
}
