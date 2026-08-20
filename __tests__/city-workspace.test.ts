import { OfflineChinaMapAdapter } from "../src/features/cities/city-map-adapter";
import {
  clampWorkspaceViewport,
  getWorkspaceTranslationLimits,
  getCityWorkspaceLayout,
  reorderCityMemoryIds,
  resolveCityFocus,
} from "../src/features/cities/city-workspace";

describe("city workspace helpers", () => {
  it("clamps the workspace scale and translation to the visible map bounds", () => {
    const size = { height: 200, width: 300 };
    const limits = getWorkspaceTranslationLimits(3.5, size);
    expect(limits.x).toBeCloseTo(264.2, 1);
    expect(limits.y).toBeCloseTo(250, 1);
    expect(clampWorkspaceViewport({ scale: 7, translateX: 900, translateY: -900 }, size)).toEqual({
      scale: 3.5,
      translateX: limits.x,
      translateY: -250,
    });
    expect(clampWorkspaceViewport({ scale: 0.2, translateX: 20, translateY: -20 }, { height: 200, width: 300 })).toEqual({
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
  });

  it("uses the adapter city focus rather than the overview focus", () => {
    const adapter = new OfflineChinaMapAdapter();

    expect(resolveCityFocus(adapter, "shenzhen")).toEqual(adapter.cityFocus.shenzhen);
  });

  it("reorders a memory id deterministically without losing any entries", () => {
    expect(reorderCityMemoryIds(["first", "second", "third"], "first", 2)).toEqual(["second", "third", "first"]);
    expect(reorderCityMemoryIds(["first", "second", "third"], "missing", 1)).toEqual(["first", "second", "third"]);
  });

  it("chooses a split workspace at tablet widths and stacked workspace below it", () => {
    expect(getCityWorkspaceLayout(720)).toEqual({ collectionFlex: 55, direction: "row", mapFlex: 45 });
    expect(getCityWorkspaceLayout(719)).toEqual({ collectionFlex: undefined, direction: "column", mapFlex: undefined });
  });
});
