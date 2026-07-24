import { featuredCityIds, getCityCardVisual } from "../src/features/cities/city-illustrations";

describe("city card visuals", () => {
  it("uses a dedicated local illustration for each featured city", () => {
    expect(featuredCityIds).toEqual(["shanghai", "shenzhen", "hangzhou", "nanjing", "beijing", "hongkong"]);
    for (const city of featuredCityIds) {
      expect(getCityCardVisual(city)).toMatchObject({ kind: "illustration" });
    }
  });

  it("uses the shared line-drawing placeholder for non-featured cities", () => {
    expect(getCityCardVisual("chengdu")).toEqual({ kind: "placeholder" });
  });
});
