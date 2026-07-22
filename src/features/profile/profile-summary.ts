import type { Memory } from "../../types/memory";

export type ProfileSummary = {
  cityCount: number;
  memoryCount: number;
  photoCount: number;
  recentMemory: Memory | undefined;
};

export function getProfileSummary(memories: Memory[]): ProfileSummary {
  const recentMemory = memories.reduce<Memory | undefined>((latest, memory) => {
    if (!latest || new Date(memory.updatedAt).getTime() > new Date(latest.updatedAt).getTime()) {
      return memory;
    }
    return latest;
  }, undefined);

  return {
    memoryCount: memories.length,
    cityCount: new Set(memories.map((memory) => memory.city)).size,
    photoCount: memories.reduce((count, memory) => count + memory.photoUris.length, 0),
    recentMemory,
  };
}
