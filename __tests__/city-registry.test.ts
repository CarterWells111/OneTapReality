import { cityRegistry, cities } from "../src/types/city";
import { resolveCityRouteParam } from "../src/features/cities/city-route";
import { OfflineChinaMapAdapter, getCityStats } from "../src/features/cities";

describe("city registry", () => {
  it("covers every first-batch capital and municipality with stable local metadata", () => {
    expect(cities).toHaveLength(35);
    expect(cities).toEqual(expect.arrayContaining([
      "beijing", "tianjin", "shanghai", "chongqing", "taipei",
      "hefei", "fuzhou", "lanzhou", "guangzhou", "guiyang", "haikou",
      "shijiazhuang", "harbin", "zhengzhou", "wuhan", "changsha", "nanjing",
      "nanchang", "changchun", "shenyang", "xining", "xian", "jinan",
      "taiyuan", "chengdu", "kunming", "hangzhou", "nanning", "hohhot",
      "yinchuan", "urumqi", "lhasa", "luoyang", "suzhou",
    ]));
    expect(cities).toContain("shenzhen");
    expect(cityRegistry.find((city) => city.id === "beijing")).toMatchObject({
      kind: "municipality",
      name: "北京",
      region: "北京市",
    });
    expect(cityRegistry.find((city) => city.id === "taipei")).toMatchObject({
      kind: "province-capital",
      name: "台北",
      region: "台湾省",
    });
    expect(cityRegistry.every((city) => city.coordinate.x >= 0 && city.coordinate.x <= 1 && city.coordinate.y >= 0 && city.coordinate.y <= 1 && city.focus.zoom >= 1)).toBe(true);
  });

  it("feeds routes, map markers, and zeroed statistics from the same registry", () => {
    const adapter = new OfflineChinaMapAdapter();

    expect(resolveCityRouteParam("beijing")).toBe("beijing");
    expect(resolveCityRouteParam("taipei")).toBe("taipei");
    expect(adapter.markers.map((marker) => marker.city)).toEqual(cities);
    expect(getCityStats([])).toHaveLength(cities.length);
    expect(getCityStats([{ city: "beijing", status: "saved" }]).find((stat) => stat.city === "beijing")).toMatchObject({ visitCount: 1, unlocked: true });
  });

  it("calibrates city markers to the packaged China SVG geography", () => {
    const byId = Object.fromEntries(cityRegistry.map((city) => [city.id, city]));

    expect(byId.beijing?.coordinate).toMatchObject({ x: expect.closeTo(0.7, 2), y: expect.closeTo(0.46, 2) });
    expect(byId.shanghai?.coordinate).toMatchObject({ x: expect.closeTo(0.8, 2), y: expect.closeTo(0.69, 2) });
    expect(byId.shenzhen?.coordinate).toMatchObject({ x: expect.closeTo(0.68, 2), y: expect.closeTo(0.9, 2) });
    expect(byId.haikou?.coordinate).toMatchObject({ x: expect.closeTo(0.62, 2), y: expect.closeTo(0.95, 2) });
  });
});
