import type { SQLiteDatabase } from "expo-sqlite";

import {
  fetchCityCollectionArrangements,
  persistCityCollectionOrder,
  resolveCityCollection,
  saveCityCollection,
  setFeaturedCityMemory,
} from "../src/storage/city-collection-repository";

type MemoryRow = {
  id: string;
  title: string;
  city: "hangzhou" | "shanghai" | "shenzhen";
  travelDate: string;
  status?: "draft" | "saved" | "discarded";
  createdAt: string;
  updatedAt: string;
};

type ArrangementRow = {
  memory_id: string;
  city: MemoryRow["city"];
  position: number;
  is_featured: number;
  updated_at: string;
};

function createDatabase(options: {
  memories: MemoryRow[];
  arrangements?: ArrangementRow[];
  failOnMemoryId?: string;
  failOnFeaturedMemoryId?: string;
}) {
  const memories = [...options.memories];
  const arrangements = [...(options.arrangements ?? [])];
  const runCalls: Array<{ statement: string; parameters: unknown[] }> = [];
  let transactions = 0;
  let exclusiveTransactions = 0;

  const getAllAsync = async <T>(statement: string, ...parameters: unknown[]) => {
      if (statement.includes("FROM city_collection_arrangements")) {
        return arrangements
          .filter((row) => row.city === parameters[0])
          .sort((left, right) => left.position - right.position) as T[];
      }
      if (statement.includes("FROM memories")) {
        if (parameters[0] === "draft" && parameters[1] === "discarded") {
          return memories.filter((row) => row.status !== "draft" && row.status !== "discarded") as T[];
        }
        return memories.filter((row) => row.status === parameters[0]) as T[];
      }
      return [] as T[];
    };
  const runAsync = async (statement: string, ...parameters: unknown[]) => {
      runCalls.push({ statement, parameters });
      if (statement.startsWith("INSERT INTO city_collection_arrangements") && statement.includes("VALUES")) {
        const [memoryId, city, position, isFeatured, updatedAt] = parameters;
        if (memoryId === options.failOnMemoryId) throw new Error("arrangement write failed");
        if (memoryId === options.failOnFeaturedMemoryId && isFeatured === 1) throw new Error("feature write failed");
        const existing = arrangements.find((row) => row.memory_id === memoryId);
        if (existing) {
          existing.city = city as ArrangementRow["city"];
          existing.position = Number(position);
          existing.updated_at = String(updatedAt);
        } else {
          arrangements.push({ memory_id: String(memoryId), city: city as ArrangementRow["city"], position: Number(position), is_featured: Number(isFeatured), updated_at: String(updatedAt) });
        }
      }
      if (statement.startsWith("DELETE FROM city_collection_arrangements")) {
        const [city, cutoff] = parameters;
        for (let index = arrangements.length - 1; index >= 0; index -= 1) {
          if (arrangements[index].city === city && (cutoff === undefined || arrangements[index].position >= Number(cutoff))) arrangements.splice(index, 1);
        }
      }
      if (statement.startsWith("UPDATE city_collection_arrangements SET is_featured = 0")) {
        for (const arrangement of arrangements) if (arrangement.city === parameters[0]) arrangement.is_featured = 0;
      }
      if (statement.startsWith("INSERT INTO city_collection_arrangements") && statement.includes("SELECT memories.id")) {
        const [, updatedAt, memoryId, city, status] = parameters;
        const allowsLegacyStatus = statement.includes("status IS NULL OR status = ?");
        const memory = memories.find((row) =>
          row.id === memoryId &&
          row.city === city &&
          (allowsLegacyStatus ? (row.status === undefined || row.status === status) : row.status === status)
        );
        if (memory) {
          const existing = arrangements.find((row) => row.memory_id === memory.id);
          if (existing) {
            existing.is_featured = 1;
            existing.updated_at = String(updatedAt);
          } else {
            arrangements.push({ memory_id: memory.id, city: memory.city, position: arrangements.filter((row) => row.city === city).length, is_featured: 1, updated_at: String(updatedAt) });
          }
        }
      }
      return { changes: 1 };
    };
  let isInsideExclusiveTransaction = false;
  const database = {
    async getAllAsync<T>(statement: string, ...parameters: unknown[]) {
      if (isInsideExclusiveTransaction) throw new Error("exclusive transaction queries must use its handle");
      return getAllAsync<T>(statement, ...parameters);
    },
    async runAsync(statement: string, ...parameters: unknown[]) {
      if (isInsideExclusiveTransaction) throw new Error("exclusive transaction queries must use its handle");
      return runAsync(statement, ...parameters);
    },
    async withTransactionAsync(callback: () => Promise<void>) {
      transactions += 1;
      await callback();
    },
    async withExclusiveTransactionAsync(callback: (transaction: SQLiteDatabase) => Promise<void>) {
      exclusiveTransactions += 1;
      const arrangementsBeforeTransaction = arrangements.map((arrangement) => ({ ...arrangement }));
      isInsideExclusiveTransaction = true;
      try {
        await callback({ getAllAsync, runAsync } as unknown as SQLiteDatabase);
      } catch (error) {
        arrangements.splice(0, arrangements.length, ...arrangementsBeforeTransaction);
        throw error;
      } finally {
        isInsideExclusiveTransaction = false;
      }
    },
  } as unknown as SQLiteDatabase;

  return {
    database,
    arrangements,
    runCalls,
    get transactions() { return transactions; },
    get exclusiveTransactions() { return exclusiveTransactions; },
  };
}

const baseMemory = {
  title: "Trip",
  travelDate: "2026-07-20",
  createdAt: "2026-07-20T10:00:00.000Z",
};

describe("city collection repository", () => {
  it("uses most recently updated saved memories as the default order without arrangements", async () => {
    const { database } = createDatabase({
      memories: [
        { ...baseMemory, id: "older", city: "shanghai", status: "saved", updatedAt: "2026-07-20T10:00:00.000Z" },
        { ...baseMemory, id: "newer", city: "shanghai", status: "saved", updatedAt: "2026-07-22T10:00:00.000Z" },
      ],
    });

    await expect(resolveCityCollection(database, "shanghai")).resolves.toMatchObject({
      memories: [{ id: "newer" }, { id: "older" }],
      featuredMemory: { id: "newer" },
    });
  });

  it("keeps legacy memories without a status in the resolved city collection", async () => {
    const { database } = createDatabase({
      memories: [
        { ...baseMemory, id: "legacy", city: "hangzhou", updatedAt: "2026-07-23T10:00:00.000Z" },
        { ...baseMemory, id: "saved", city: "hangzhou", status: "saved", updatedAt: "2026-07-22T10:00:00.000Z" },
        { ...baseMemory, id: "draft", city: "hangzhou", status: "draft", updatedAt: "2026-07-24T10:00:00.000Z" },
      ],
      arrangements: [
        { memory_id: "legacy", city: "hangzhou", position: 0, is_featured: 1, updated_at: "2026-07-23T10:00:00.000Z" },
      ],
    });

    await expect(resolveCityCollection(database, "hangzhou")).resolves.toMatchObject({
      memories: [{ id: "legacy" }, { id: "saved" }],
      featuredMemory: { id: "legacy" },
    });
  });

  it("resolves saved memories by manual arrangement, appends new memories, and falls back from stale features", async () => {
    const { database } = createDatabase({
      memories: [
        { ...baseMemory, id: "hangzhou-arranged", city: "hangzhou", status: "saved", updatedAt: "2026-07-20T10:00:00.000Z" },
        { ...baseMemory, id: "hangzhou-new", city: "hangzhou", status: "saved", updatedAt: "2026-07-22T10:00:00.000Z" },
        { ...baseMemory, id: "hangzhou-draft", city: "hangzhou", status: "draft", updatedAt: "2026-07-23T10:00:00.000Z" },
        { ...baseMemory, id: "shanghai", city: "shanghai", status: "saved", updatedAt: "2026-07-24T10:00:00.000Z" },
      ],
      arrangements: [
        { memory_id: "hangzhou-arranged", city: "hangzhou", position: 0, is_featured: 0, updated_at: "2026-07-20T10:00:00.000Z" },
        { memory_id: "deleted-memory", city: "hangzhou", position: 1, is_featured: 1, updated_at: "2026-07-20T10:00:00.000Z" },
      ],
    });

    await expect(resolveCityCollection(database, "hangzhou")).resolves.toMatchObject({
      city: "hangzhou",
      memories: [{ id: "hangzhou-arranged" }, { id: "hangzhou-new" }],
      featuredMemory: { id: "hangzhou-arranged" },
    });
  });

  it("writes a full local order transactionally and keeps one valid featured memory", async () => {
    const fixture = createDatabase({
      memories: [
        { ...baseMemory, id: "first", city: "shenzhen", status: "saved", updatedAt: "2026-07-20T10:00:00.000Z" },
        { ...baseMemory, id: "second", city: "shenzhen", status: "saved", updatedAt: "2026-07-21T10:00:00.000Z" },
      ],
    });

    await persistCityCollectionOrder(fixture.database, "shenzhen", ["second", "first"], "2026-07-22T10:00:00.000Z");
    await setFeaturedCityMemory(fixture.database, "shenzhen", "first", "2026-07-22T10:01:00.000Z");

    expect(fixture.exclusiveTransactions).toBe(2);
    expect(fixture.runCalls.every((call) => !call.statement.includes("'shenzhen'") && !call.statement.includes("'first'"))).toBe(true);
    await expect(fetchCityCollectionArrangements(fixture.database, "shenzhen")).resolves.toEqual([
      { memoryId: "second", city: "shenzhen", position: 0, isFeatured: false, updatedAt: "2026-07-22T10:00:00.000Z" },
      { memoryId: "first", city: "shenzhen", position: 1, isFeatured: true, updatedAt: "2026-07-22T10:01:00.000Z" },
    ]);
    await expect(resolveCityCollection(fixture.database, "shenzhen")).resolves.toMatchObject({
      memories: [{ id: "second" }, { id: "first" }],
      featuredMemory: { id: "first" },
    });
  });

  it("can feature a legacy memory without a status", async () => {
    const fixture = createDatabase({
      memories: [{ ...baseMemory, id: "legacy-feature", city: "shenzhen", updatedAt: "2026-07-20T10:00:00.000Z" }],
    });

    await setFeaturedCityMemory(fixture.database, "shenzhen", "legacy-feature", "2026-07-22T10:01:00.000Z");

    await expect(fetchCityCollectionArrangements(fixture.database, "shenzhen")).resolves.toEqual([
      { memoryId: "legacy-feature", city: "shenzhen", position: 0, isFeatured: true, updatedAt: "2026-07-22T10:01:00.000Z" },
    ]);
  });

  it("does not feature draft or discarded memories", async () => {
    const fixture = createDatabase({
      memories: [
        { ...baseMemory, id: "draft-feature", city: "shenzhen", status: "draft", updatedAt: "2026-07-20T10:00:00.000Z" },
        { ...baseMemory, id: "discarded-feature", city: "shenzhen", status: "discarded", updatedAt: "2026-07-20T10:00:00.000Z" },
      ],
    });

    await setFeaturedCityMemory(fixture.database, "shenzhen", "draft-feature", "2026-07-22T10:01:00.000Z");
    await setFeaturedCityMemory(fixture.database, "shenzhen", "discarded-feature", "2026-07-22T10:02:00.000Z");

    await expect(fetchCityCollectionArrangements(fixture.database, "shenzhen")).resolves.toEqual([]);
  });

  it("silently filters foreign, draft, and discarded IDs while preserving a full valid city order", async () => {
    const fixture = createDatabase({
      memories: [
        { ...baseMemory, id: "hangzhou-saved", city: "hangzhou", status: "saved", updatedAt: "2026-07-20T10:00:00.000Z" },
        { ...baseMemory, id: "hangzhou-old", city: "hangzhou", status: "saved", updatedAt: "2026-07-19T10:00:00.000Z" },
        { ...baseMemory, id: "shanghai-saved", city: "shanghai", status: "saved", updatedAt: "2026-07-21T10:00:00.000Z" },
        { ...baseMemory, id: "hangzhou-draft", city: "hangzhou", status: "draft", updatedAt: "2026-07-22T10:00:00.000Z" },
        { ...baseMemory, id: "hangzhou-discarded", city: "hangzhou", status: "discarded", updatedAt: "2026-07-23T10:00:00.000Z" },
      ],
      arrangements: [
        { memory_id: "hangzhou-old", city: "hangzhou", position: 0, is_featured: 0, updated_at: "2026-07-19T10:00:00.000Z" },
        { memory_id: "shanghai-saved", city: "shanghai", position: 0, is_featured: 0, updated_at: "2026-07-21T10:00:00.000Z" },
      ],
    });

    await persistCityCollectionOrder(
      fixture.database,
      "hangzhou",
      ["hangzhou-saved", "shanghai-saved", "hangzhou-draft", "hangzhou-discarded"],
      "2026-07-24T10:00:00.000Z"
    );

    await expect(fetchCityCollectionArrangements(fixture.database, "hangzhou")).resolves.toEqual([
      { memoryId: "hangzhou-saved", city: "hangzhou", position: 0, isFeatured: false, updatedAt: "2026-07-24T10:00:00.000Z" },
    ]);
    await expect(fetchCityCollectionArrangements(fixture.database, "shanghai")).resolves.toEqual([
      { memoryId: "shanghai-saved", city: "shanghai", position: 0, isFeatured: false, updatedAt: "2026-07-21T10:00:00.000Z" },
    ]);
    await expect(resolveCityCollection(fixture.database, "hangzhou")).resolves.toMatchObject({
      memories: [{ id: "hangzhou-saved" }, { id: "hangzhou-old" }],
    });
  });

  it("rolls back a failed full order replacement without leaving partial arrangements", async () => {
    const fixture = createDatabase({
      memories: [
        { ...baseMemory, id: "replacement-first", city: "hangzhou", status: "saved", updatedAt: "2026-07-21T10:00:00.000Z" },
        { ...baseMemory, id: "replacement-second", city: "hangzhou", status: "saved", updatedAt: "2026-07-22T10:00:00.000Z" },
      ],
      arrangements: [
        { memory_id: "original-first", city: "hangzhou", position: 0, is_featured: 1, updated_at: "2026-07-19T10:00:00.000Z" },
        { memory_id: "original-second", city: "hangzhou", position: 1, is_featured: 0, updated_at: "2026-07-19T10:00:00.000Z" },
      ],
      failOnMemoryId: "replacement-second",
    });

    await expect(
      persistCityCollectionOrder(
        fixture.database,
        "hangzhou",
        ["replacement-first", "replacement-second"],
        "2026-07-24T10:00:00.000Z"
      )
    ).rejects.toThrow("arrangement write failed");

    expect(fixture.exclusiveTransactions).toBe(1);
    await expect(fetchCityCollectionArrangements(fixture.database, "hangzhou")).resolves.toEqual([
      { memoryId: "original-first", city: "hangzhou", position: 0, isFeatured: true, updatedAt: "2026-07-19T10:00:00.000Z" },
      { memoryId: "original-second", city: "hangzhou", position: 1, isFeatured: false, updatedAt: "2026-07-19T10:00:00.000Z" },
    ]);
  });

  it("atomically writes order and representative selection", async () => {
    const fixture = createDatabase({
      memories: [
        { ...baseMemory, id: "first", city: "hangzhou", status: "saved", updatedAt: "2026-07-20T10:00:00.000Z" },
        { ...baseMemory, id: "second", city: "hangzhou", status: "saved", updatedAt: "2026-07-21T10:00:00.000Z" },
      ],
    });

    await saveCityCollection(fixture.database, "hangzhou", ["second", "first"], "first", "2026-07-24T10:00:00.000Z");

    expect(fixture.exclusiveTransactions).toBe(1);
    await expect(fetchCityCollectionArrangements(fixture.database, "hangzhou")).resolves.toEqual([
      { memoryId: "second", city: "hangzhou", position: 0, isFeatured: false, updatedAt: "2026-07-24T10:00:00.000Z" },
      { memoryId: "first", city: "hangzhou", position: 1, isFeatured: true, updatedAt: "2026-07-24T10:00:00.000Z" },
    ]);
  });

  it("rolls back the replacement order when representative persistence fails", async () => {
    const fixture = createDatabase({
      memories: [
        { ...baseMemory, id: "first", city: "hangzhou", status: "saved", updatedAt: "2026-07-20T10:00:00.000Z" },
        { ...baseMemory, id: "second", city: "hangzhou", status: "saved", updatedAt: "2026-07-21T10:00:00.000Z" },
      ],
      arrangements: [
        { memory_id: "original", city: "hangzhou", position: 0, is_featured: 1, updated_at: "2026-07-19T10:00:00.000Z" },
      ],
      failOnFeaturedMemoryId: "first",
    });

    await expect(
      saveCityCollection(fixture.database, "hangzhou", ["second", "first"], "first", "2026-07-24T10:00:00.000Z")
    ).rejects.toThrow("feature write failed");

    expect(fixture.exclusiveTransactions).toBe(1);
    await expect(fetchCityCollectionArrangements(fixture.database, "hangzhou")).resolves.toEqual([
      { memoryId: "original", city: "hangzhou", position: 0, isFeatured: true, updatedAt: "2026-07-19T10:00:00.000Z" },
    ]);
  });
});
