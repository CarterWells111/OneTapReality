import { OfflineChinaMapAdapter } from "../src/features/cities/city-map-adapter";
import {
  clampWorkspaceViewport,
  getWorkspaceTranslationLimits,
  getCityWorkspaceLayout,
  reorderCityMemoryIds,
  resolveCityFocus,
  workspaceMaxScale,
  workspaceMinScale,
  workspacePanOverscanRatio,
} from "../src/features/cities/city-workspace";
import { resolveNormalizedMapScreenPoint } from "../src/features/cities/city-label-layout";

describe("city workspace helpers", () => {
  it("clamps the workspace scale and translation to the expanded map bounds", () => {
    const size = { height: 200, width: 300 };
    const limits = getWorkspaceTranslationLimits(workspaceMaxScale, size);
    expect(limits.x).toBeCloseTo(710.1, 1);
    expect(limits.y).toBe(600);
    expect(clampWorkspaceViewport({ scale: 9, translateX: 900, translateY: -900 }, size)).toEqual({
      scale: workspaceMaxScale,
      translateX: limits.x,
      translateY: -limits.y,
    });
    expect(clampWorkspaceViewport({ scale: 0.2, translateX: 20, translateY: -20 }, size)).toEqual({
      scale: workspaceMinScale,
      translateX: 20,
      translateY: -20,
    });
  });

  it("keeps a half-viewport overscan on both axes at the minimum scale", () => {
    const size = { height: 200, width: 300 };

    expect(workspaceMinScale).toBe(1);
    expect(workspaceMaxScale).toBe(6);
    expect(workspacePanOverscanRatio).toBe(0.5);
    expect(getWorkspaceTranslationLimits(workspaceMinScale, size)).toEqual({ x: 150, y: 100 });
  });

  it("can bring the westernmost product city into the central viewport at 6x", () => {
    const size = { height: 320, width: 480 };
    const adapter = new OfflineChinaMapAdapter();
    const westernmostCity = adapter.markers.reduce((westernmost, marker) => (
      marker.coordinate.x < westernmost.coordinate.x ? marker : westernmost
    ));
    const unpanned = resolveNormalizedMapScreenPoint(westernmostCity.coordinate, {
      scale: workspaceMaxScale,
      translateX: 0,
      translateY: 0,
    }, size);
    const limits = getWorkspaceTranslationLimits(workspaceMaxScale, size);
    const viewport = clampWorkspaceViewport({
      scale: workspaceMaxScale,
      translateX: size.width / 2 - unpanned.x,
      translateY: size.height / 2 - unpanned.y,
    }, size);
    const point = resolveNormalizedMapScreenPoint(westernmostCity.coordinate, viewport, size);

    expect(Math.abs(viewport.translateX)).toBeLessThanOrEqual(limits.x);
    expect(Math.abs(viewport.translateY)).toBeLessThanOrEqual(limits.y);
    expect(point.x).toBeCloseTo(size.width / 2);
    expect(point.y).toBeCloseTo(size.height / 2);
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
