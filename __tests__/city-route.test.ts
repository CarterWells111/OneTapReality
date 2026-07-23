import { resolveCityRouteParam } from "../src/features/cities/city-route";

describe("resolveCityRouteParam", () => {
  it("keeps supported city presets and falls back safely", () => {
    expect(resolveCityRouteParam("shenzhen")).toBe("shenzhen");
    expect(resolveCityRouteParam("unknown")).toBe("hangzhou");
    expect(resolveCityRouteParam(undefined)).toBe("hangzhou");
  });
});
