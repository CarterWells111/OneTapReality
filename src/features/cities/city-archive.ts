import type { City } from "../../types/city";
import type { Memory } from "../../types/memory";

export const popularCityOrder = ["shanghai", "shenzhen", "hangzhou", "nanjing", "beijing", "hongkong"] as const satisfies readonly City[];

type CityArchiveMemory = Pick<Memory, "city" | "createdAt" | "status">;

const MAX_ARCHIVE_CITIES = 5;

function createdAtValue(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getCityArchiveCities(memories: readonly CityArchiveMemory[]): City[] {
  const newestVisitByCity = new Map<City, number>();

  for (const memory of memories) {
    if (memory.status === "draft" || memory.status === "discarded") continue;
    const createdAt = createdAtValue(memory.createdAt);
    const previous = newestVisitByCity.get(memory.city);
    if (previous === undefined || createdAt > previous) {
      newestVisitByCity.set(memory.city, createdAt);
    }
  }

  const visitedCities = [...newestVisitByCity.entries()]
    .sort(([leftCity, leftDate], [rightCity, rightDate]) => rightDate - leftDate || leftCity.localeCompare(rightCity))
    .map(([city]) => city)
    .slice(0, MAX_ARCHIVE_CITIES);
  const selected = new Set(visitedCities);

  for (const city of popularCityOrder) {
    if (selected.size === MAX_ARCHIVE_CITIES) break;
    selected.add(city);
  }

  return [...selected];
}
