import { featuredCityIds, getCityCardVisual } from "../src/features/cities/city-illustrations";

describe("city card visuals", () => {
  it("keeps the legacy watercolor illustrations registered for the six featured cities", () => {
    expect(featuredCityIds).toEqual(["shanghai", "shenzhen", "hangzhou", "nanjing", "beijing", "hongkong"]);
    for (const city of featuredCityIds) {
      expect(getCityCardVisual(city)).toMatchObject({ kind: "illustration" });
    }
  });

  it("uses the hand-drawn checkin map as the card visual when the city has one", () => {
    expect(getCityCardVisual("chengdu")).toMatchObject({ kind: "illustration" });
    expect(getCityCardVisual("wuhan")).toMatchObject({ kind: "illustration" });
    expect(getCityCardVisual("hangzhou")).toMatchObject({ kind: "illustration" });
  });

  it("uses the shared line-drawing placeholder for cities without a checkin map or watercolor", () => {
    expect(getCityCardVisual("lhasa")).toEqual({ kind: "placeholder" });
    expect(getCityCardVisual("urumqi")).toEqual({ kind: "placeholder" });
  });
});
