import {
  OfflineChinaMapAdapter,
  getCityStats,
} from "../src/features/cities";
import { createMemory } from "../src/features/memories/memory-factory";

describe("city map domain data", () => {
  it("returns zeroed statistics for every city when no saved memories exist", () => {
    expect(getCityStats([])).toEqual([
      { city: "hangzhou", visitCount: 0, unlocked: false, isVisited: false, intensity: "none" },
      { city: "shanghai", visitCount: 0, unlocked: false, isVisited: false, intensity: "none" },
      { city: "shenzhen", visitCount: 0, unlocked: false, isVisited: false, intensity: "none" },
    ]);
  });

  it("counts only saved memories across cities and assigns every intensity threshold", () => {
    const memories = [
      { city: "hangzhou", status: "saved" },
      { city: "shanghai", status: "saved" },
      { city: "shanghai", status: "saved" },
      { city: "shanghai", status: "saved" },
      { city: "shenzhen", status: "saved" },
      { city: "shenzhen", status: "saved" },
      { city: "shenzhen", status: "saved" },
      { city: "shenzhen", status: "saved" },
      { city: "shenzhen", status: "draft" },
      { city: "hangzhou", status: "draft" },
    ] as const;

    expect(getCityStats(memories)).toEqual([
      { city: "hangzhou", visitCount: 1, unlocked: true, isVisited: true, intensity: "light" },
      { city: "shanghai", visitCount: 3, unlocked: true, isVisited: true, intensity: "medium" },
      { city: "shenzhen", visitCount: 4, unlocked: true, isVisited: true, intensity: "strong" },
    ]);
  });

  it("treats legacy memories without a status as saved", () => {
    const legacyMemory = createMemory({
      id: "legacy-hangzhou",
      now: "2026-07-22T10:00:00.000Z",
      input: {
        title: "Legacy trip",
        city: "hangzhou",
        travelDate: "2026-07-20",
        photoUris: [],
      },
      pages: [],
    });

    expect(getCityStats([legacyMemory, { city: "hangzhou", status: "draft" }])[0]).toMatchObject({
      city: "hangzhou",
      visitCount: 1,
      intensity: "light",
    });
  });

  it("exposes a local China outline, fixed city markers, and initial focus without remote URLs", () => {
    const adapter = new OfflineChinaMapAdapter();
    const serialized = JSON.stringify(adapter);

    expect(adapter.outline).toMatchObject({ id: "china-simplified", coordinateSpace: "relative" });
    expect(adapter.outline.points.length).toBeGreaterThan(3);
    expect(adapter.markers).toEqual([
      { city: "hangzhou", coordinate: { x: 0.77, y: 0.69 } },
      { city: "shanghai", coordinate: { x: 0.86, y: 0.64 } },
      { city: "shenzhen", coordinate: { x: 0.71, y: 0.84 } },
    ]);
    expect(adapter.initialFocus).toEqual({ center: { x: 0.62, y: 0.53 }, zoom: 1 });
    expect(serialized).not.toMatch(/https?:|www\./i);
  });

  it("does not let consumer mutation alter map data exposed by another adapter", () => {
    const firstAdapter = new OfflineChinaMapAdapter();
    const mutableMarker = firstAdapter.markers[0].coordinate as { x: number; y: number };
    const mutableOutlinePoint = firstAdapter.outline.points[0] as { x: number; y: number };

    try {
      mutableMarker.x = 0;
      mutableOutlinePoint.y = 0;
    } catch {
      // Frozen local data may reject a consumer mutation; either outcome must leave adapters unchanged.
    }

    const secondAdapter = new OfflineChinaMapAdapter();
    expect(secondAdapter.markers[0].coordinate).toEqual({ x: 0.77, y: 0.69 });
    expect(secondAdapter.outline.points[0]).toEqual({ x: 0.14, y: 0.25 });
  });
});
