import type { City } from "../../types/memory";

type CityMemory = {
  city: City;
};

export function getUnlockedCities(memories: CityMemory[]): City[] {
  return Array.from(new Set(memories.map((memory) => memory.city)));
}

