import { cities, type City, type Memory } from "../../types/memory";

export type CityVisitIntensity = "none" | "light" | "medium" | "strong";

export type CityStats = {
  city: City;
  visitCount: number;
  unlocked: boolean;
  isVisited: boolean;
  intensity: CityVisitIntensity;
};

type CityMemory = Pick<Memory, "city" | "status">;

export function getCityVisitIntensity(visitCount: number): CityVisitIntensity {
  if (visitCount === 0) return "none";
  if (visitCount === 1) return "light";
  if (visitCount <= 3) return "medium";
  return "strong";
}

export function getCityStats(memories: readonly CityMemory[]): CityStats[] {
  const visitCounts = new Map<City, number>(cities.map((city) => [city, 0]));

  for (const memory of memories) {
    if (memory.status === "saved") {
      visitCounts.set(memory.city, (visitCounts.get(memory.city) ?? 0) + 1);
    }
  }

  return cities.map((city) => {
    const visitCount = visitCounts.get(city) ?? 0;
    const isVisited = visitCount > 0;
    return { city, visitCount, unlocked: isVisited, isVisited, intensity: getCityVisitIntensity(visitCount) };
  });
}
