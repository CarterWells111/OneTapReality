import { getUnlockedCities } from "../src/features/cities/city-unlocks";

describe("getUnlockedCities", () => {
  it("retains compatibility with legacy city-only values that have no status field", () => {
    const legacyValues: Array<{ city: "hangzhou" | "shanghai" | "shenzhen" }> = [
      { city: "shanghai" },
      { city: "hangzhou" },
      { city: "shanghai" },
    ];

    expect(getUnlockedCities(legacyValues)).toEqual(["shanghai", "hangzhou"]);
  });

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
