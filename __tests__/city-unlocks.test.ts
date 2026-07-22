import { getUnlockedCities } from "../src/features/cities/city-unlocks";

describe("getUnlockedCities", () => {
  it("returns each city only once when memories exist for it", () => {
    expect(
      getUnlockedCities([
        { city: "hangzhou" },
        { city: "hangzhou" },
        { city: "shenzhen" },
      ])
    ).toEqual(["hangzhou", "shenzhen"]);
  });
});
