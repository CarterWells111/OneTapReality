import {
  createBackendTestDatabase,
  migrateBackendDatabase,
} from "../src/server/db/test-database";
import {
  createDevice,
  createMemory,
  deleteMemory,
  getMemory,
  listMemories,
  updateMemory,
} from "../src/server/memories/repository";
import { memoryPages } from "../src/server/db/schema";

describe("backend memory repository", () => {
  it("isolates memories by device and cascades pages on delete", async () => {
    const { db, close } = createBackendTestDatabase();
    try {
      await migrateBackendDatabase(db);
      await createDevice(db, {
        id: "device-a",
        installationId: "install-a",
        tokenHash: "hash-a",
        createdAt: "2026-07-22T00:00:00.000Z",
      });
      await createDevice(db, {
        id: "device-b",
        installationId: "install-b",
        tokenHash: "hash-b",
        createdAt: "2026-07-22T00:00:00.000Z",
      });
      const memory = await createMemory(db, "device-a", {
        title: "A memory",
        city: "hangzhou",
        travelDate: "2026-07-22",
        status: "saved",
        photoCount: 1,
        pages: [
          {
            id: "page-1",
            position: 0,
            kind: "cover",
            headline: "A",
            body: "B",
            layout: { aspectRatio: 1, elements: [] },
          },
        ],
      });

      expect((await listMemories(db, "device-a")).length).toBe(1);
      expect(await listMemories(db, "device-b")).toEqual([]);
      expect(await getMemory(db, "device-b", memory.id)).toBeNull();
      expect(await updateMemory(db, "device-b", memory.id, {
        ...memory,
        title: "Not allowed",
      })).toBeNull();
      expect(await deleteMemory(db, "device-b", memory.id)).toBe(false);
      expect((await getMemory(db, "device-a", memory.id))?.pages[0].layout).toEqual({
        aspectRatio: 1,
        elements: [],
      });

      expect(await deleteMemory(db, "device-a", memory.id)).toBe(true);
      expect(await getMemory(db, "device-a", memory.id)).toBeNull();
      expect(await db.select().from(memoryPages)).toEqual([]);
    } finally {
      await close();
    }
  });
});
