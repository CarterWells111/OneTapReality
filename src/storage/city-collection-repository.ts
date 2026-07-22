import type { SQLiteDatabase } from "expo-sqlite";

import { listMemories } from "./memory-repository";
import type { City, Memory } from "../types/memory";

type CityCollectionArrangementRow = {
  memory_id: string;
  city: City;
  position: number;
  is_featured: number;
  updated_at: string;
};

export type CityCollectionArrangement = {
  memoryId: string;
  city: City;
  position: number;
  isFeatured: boolean;
  updatedAt: string;
};

export type ResolvedCityCollection = {
  city: City;
  memories: Memory[];
  featuredMemory: Memory | null;
};

function toArrangement(row: CityCollectionArrangementRow): CityCollectionArrangement {
  return {
    memoryId: row.memory_id,
    city: row.city,
    position: row.position,
    isFeatured: row.is_featured === 1,
    updatedAt: row.updated_at,
  };
}

export async function fetchCityCollectionArrangements(
  db: SQLiteDatabase,
  city: City
): Promise<CityCollectionArrangement[]> {
  const rows = await db.getAllAsync<CityCollectionArrangementRow>(
    "SELECT memory_id, city, position, is_featured, updated_at FROM city_collection_arrangements WHERE city = ? ORDER BY position ASC",
    city
  );
  return rows.map(toArrangement);
}

export async function persistCityCollectionOrder(
  db: SQLiteDatabase,
  city: City,
  memoryIds: readonly string[],
  updatedAt: string
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const [memories, existingArrangements] = await Promise.all([
      listMemories(transaction),
      fetchCityCollectionArrangements(transaction, city),
    ]);
    const savedCityMemoryIds = new Set(
      memories
        .filter((memory) => memory.city === city && memory.status === "saved")
        .map((memory) => memory.id)
    );
    const orderedMemoryIds = Array.from(new Set(memoryIds)).filter((memoryId) =>
      savedCityMemoryIds.has(memoryId)
    );
    const featuredMemoryId = existingArrangements.find(
      (arrangement) =>
        arrangement.isFeatured &&
        savedCityMemoryIds.has(arrangement.memoryId) &&
        orderedMemoryIds.includes(arrangement.memoryId)
    )?.memoryId;

    await transaction.runAsync(
      "DELETE FROM city_collection_arrangements WHERE city = ?",
      city
    );
    for (const [position, memoryId] of orderedMemoryIds.entries()) {
      await transaction.runAsync(
        "INSERT INTO city_collection_arrangements (memory_id, city, position, is_featured, updated_at) VALUES (?, ?, ?, ?, ?)",
        memoryId,
        city,
        position,
        memoryId === featuredMemoryId ? 1 : 0,
        updatedAt
      );
    }
  });
}

export async function setFeaturedCityMemory(
  db: SQLiteDatabase,
  city: City,
  memoryId: string,
  updatedAt: string
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "UPDATE city_collection_arrangements SET is_featured = 0 WHERE city = ? AND EXISTS (SELECT 1 FROM memories WHERE id = ? AND city = ? AND status = ?)",
      city,
      memoryId,
      city,
      "saved"
    );
    await transaction.runAsync(
      "INSERT INTO city_collection_arrangements (memory_id, city, position, is_featured, updated_at) SELECT memories.id, memories.city, COALESCE((SELECT MAX(position) + 1 FROM city_collection_arrangements WHERE city = ?), 0), 1, ? FROM memories WHERE id = ? AND city = ? AND status = ? ON CONFLICT(memory_id) DO UPDATE SET city = excluded.city, is_featured = excluded.is_featured, updated_at = excluded.updated_at",
      city,
      updatedAt,
      memoryId,
      city,
      "saved"
    );
  });
}

export async function resolveCityCollection(
  db: SQLiteDatabase,
  city: City
): Promise<ResolvedCityCollection> {
  const [memories, arrangements] = await Promise.all([
    listMemories(db),
    fetchCityCollectionArrangements(db, city),
  ]);
  const cityMemories = memories.filter((memory) => memory.city === city && memory.status === "saved");
  const memoryById = new Map(cityMemories.map((memory) => [memory.id, memory]));
  const arrangedMemories = arrangements
    .map((arrangement) => memoryById.get(arrangement.memoryId))
    .filter((memory): memory is Memory => memory !== undefined);
  const arrangedIds = new Set(arrangedMemories.map((memory) => memory.id));
  const unarrangedMemories = cityMemories
    .filter((memory) => !arrangedIds.has(memory.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const resolvedMemories = [...arrangedMemories, ...unarrangedMemories];
  const featuredArrangement = arrangements.find(
    (arrangement) => arrangement.isFeatured && memoryById.has(arrangement.memoryId)
  );

  return {
    city,
    memories: resolvedMemories,
    featuredMemory: featuredArrangement
      ? memoryById.get(featuredArrangement.memoryId) ?? null
      : resolvedMemories[0] ?? null,
  };
}
