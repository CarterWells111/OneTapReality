import { getCityArchiveCities, popularCityOrder } from "../src/features/cities/city-archive";

describe("city archive selection", () => {
  it("prioritizes cities by their latest valid album creation time", () => {
    expect(getCityArchiveCities([
      { city: "hangzhou", createdAt: "2026-07-21T09:00:00.000Z", status: "saved" },
      { city: "shanghai", createdAt: "2026-07-22T09:00:00.000Z", status: "saved" },
      { city: "hangzhou", createdAt: "2026-07-23T09:00:00.000Z", status: "saved" },
    ])).toEqual(["hangzhou", "shanghai", "shenzhen", "nanjing", "beijing"]);
  });

  it("ignores draft and discarded albums when choosing visited cities", () => {
    expect(getCityArchiveCities([
      { city: "hongkong", createdAt: "2026-07-24T09:00:00.000Z", status: "draft" },
      { city: "beijing", createdAt: "2026-07-23T09:00:00.000Z", status: "discarded" },
      { city: "nanjing", createdAt: "2026-07-22T09:00:00.000Z" },
    ])).toEqual(["nanjing", "shanghai", "shenzhen", "hangzhou", "beijing"]);
  });

  it("fills the remaining slots in popular order without duplicates and caps the archive at five cities", () => {
    expect(popularCityOrder).toEqual(["shanghai", "shenzhen", "hangzhou", "nanjing", "beijing", "hongkong"]);
    expect(getCityArchiveCities([])).toEqual(["shanghai", "shenzhen", "hangzhou", "nanjing", "beijing"]);
    expect(getCityArchiveCities([
      { city: "urumqi", createdAt: "2026-07-25T09:00:00.000Z", status: "saved" },
      { city: "harbin", createdAt: "2026-07-24T09:00:00.000Z", status: "saved" },
      { city: "changchun", createdAt: "2026-07-23T09:00:00.000Z", status: "saved" },
      { city: "hohhot", createdAt: "2026-07-22T09:00:00.000Z", status: "saved" },
      { city: "shenyang", createdAt: "2026-07-21T09:00:00.000Z", status: "saved" },
      { city: "yinchuan", createdAt: "2026-07-20T09:00:00.000Z", status: "saved" },
    ])).toEqual(["urumqi", "harbin", "changchun", "hohhot", "shenyang"]);
  });
});
