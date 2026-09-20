import { featuredCityIds, getCityCardVisual } from "../src/features/cities/city-illustrations";

describe("city card visuals", () => {
  it("uses a dedicated local illustration for each featured city", () => {
    expect(featuredCityIds).toEqual(["shanghai", "shenzhen", "hangzhou", "nanjing", "beijing", "hongkong"]);
    for (const city of featuredCityIds) {
      expect(getCityCardVisual(city)).toMatchObject({ kind: "illustration" });
    }
  });

  it("gives non-featured cities their own locally rendered artwork", () => {
    expect(getCityCardVisual("chengdu")).toMatchObject({ kind: "vector", city: "chengdu" });
    expect(getCityCardVisual("lhasa")).toMatchObject({ kind: "vector", city: "lhasa" });
    expect(getCityCardVisual("chengdu")).not.toEqual(getCityCardVisual("lhasa"));
  });
});
