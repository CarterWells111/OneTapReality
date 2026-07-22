import { getProfileSummary } from "../src/features/profile/profile-summary";
import type { Memory } from "../src/types/memory";

const memory = (overrides: Partial<Memory>): Memory => ({
  id: "memory-1",
  title: "杭州周末",
  city: "hangzhou",
  travelDate: "2026-07-20",
  photoUris: ["file://west-lake.jpg"],
  pages: [],
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  ...overrides,
});

describe("getProfileSummary", () => {
  it("returns zeroed statistics without a recent memory for an empty archive", () => {
    expect(getProfileSummary([])).toEqual({ cityCount: 0, memoryCount: 0, photoCount: 0, recentMemory: undefined });
  });

  it("counts saved memories, unique cities, total photos, and the most recently updated memory", () => {
    const result = getProfileSummary([
      memory({ id: "hangzhou-1", photoUris: ["file://1.jpg", "file://2.jpg"], updatedAt: "2026-07-20T10:00:00.000Z" }),
      memory({ id: "hangzhou-2", photoUris: ["file://3.jpg"], updatedAt: "2026-07-21T10:00:00.000Z" }),
      memory({ id: "shanghai-1", city: "shanghai", photoUris: ["file://4.jpg", "file://5.jpg", "file://6.jpg"], updatedAt: "2026-07-19T10:00:00.000Z" }),
    ]);

    expect(result.memoryCount).toBe(3);
    expect(result.cityCount).toBe(2);
    expect(result.photoCount).toBe(6);
    expect(result.recentMemory?.id).toBe("hangzhou-2");
  });
});
