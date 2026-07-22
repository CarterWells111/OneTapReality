import {
  OfflineChinaMapAdapter,
  getCityStats,
} from "../src/features/cities";

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

  it("exposes a local China outline, fixed city markers, and initial focus without remote URLs", () => {
    const adapter = new OfflineChinaMapAdapter();
    const serialized = JSON.stringify(adapter);

    expect(adapter.outline).toMatchObject({ id: "china-simplified", coordinateSpace: "relative" });
    expect(adapter.outline.points.length).toBeGreaterThan(3);
    expect(adapter.markers).toEqual([
      { city: "hangzhou", coordinate: { x: 0.73, y: 0.47 } },
      { city: "shanghai", coordinate: { x: 0.78, y: 0.42 } },
      { city: "shenzhen", coordinate: { x: 0.62, y: 0.77 } },
    ]);
    expect(adapter.initialFocus).toEqual({ center: { x: 0.62, y: 0.53 }, zoom: 1 });
    expect(serialized).not.toMatch(/https?:|www\./i);
  });
});
