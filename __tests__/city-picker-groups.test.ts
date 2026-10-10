import { buildCityPickerGroups, trendingCityOrder } from "../src/features/cities/city-picker-groups";
import { cities, cityRegistry } from "../src/types/city";

describe("city picker groups", () => {
  it("puts the six trending cities in a group of their own first", () => {
    const groups = buildCityPickerGroups();

    expect(trendingCityOrder).toHaveLength(6);
    expect(groups[0]).toMatchObject({ key: "trending", label: "热门城市" });
    expect(groups[0].cities.map((city) => city.id)).toEqual([...trendingCityOrder]);
  });

  it("groups the remaining cities by pinyin initial and sorts each group by pinyin", () => {
    const groups = buildCityPickerGroups();
    const letterGroups = groups.slice(1);
    const letters = letterGroups.map((group) => group.label);

    expect(letters).toEqual([...letters].sort());
    expect(letters).toEqual([...new Set(letters)]);
    expect(letterGroups.every((group) => group.cities.every((city) => city.pinyin.slice(0, 1).toLocaleUpperCase() === group.label))).toBe(true);
    for (const group of letterGroups) {
      expect(group.cities.map((city) => city.pinyin)).toEqual([...group.cities.map((city) => city.pinyin)].sort());
    }
  });

  it("keeps every city in its letter group, trending ones included", () => {
    const letterListed = buildCityPickerGroups().slice(1).flatMap((group) => group.cities.map((city) => city.id));

    expect(letterListed).toHaveLength(cities.length);
    expect([...letterListed].sort()).toEqual([...cities].sort());
    expect(trendingCityOrder.every((id) => letterListed.includes(id))).toBe(true);
  });

  it("sorts cities whose id differs from their pinyin by the real pinyin", () => {
    const byId = Object.fromEntries(cityRegistry.map((city) => [city.id, city]));

    expect(byId.harbin?.pinyin).toBe("haerbin");
    expect(byId.hongkong?.pinyin).toBe("xianggang");
    expect(byId.urumqi?.pinyin).toBe("wulumuqi");
    expect(byId.taipei?.pinyin).toBe("taibei");

    const groupLabelled = (label: string) => buildCityPickerGroups().find((group) => group.label === label);

    expect(groupLabelled("H")?.cities.map((city) => city.id)).toEqual(["harbin", "haikou", "hangzhou", "hefei", "hohhot"]);
    expect(groupLabelled("X")?.cities.map((city) => city.id)).toEqual(["xian", "hongkong", "xining"]);
    expect(groupLabelled("W")?.cities.map((city) => city.id)).toEqual(["wuhan", "urumqi"]);
    expect(groupLabelled("C")?.cities.map((city) => city.id)).toEqual(["changchun", "changsha", "chengdu", "chongqing"]);
  });

  it("filters by name, region, id and pinyin, dropping groups that have no match", () => {
    expect(buildCityPickerGroups("杭州").map((group) => [group.label, group.cities.map((city) => city.id)])).toEqual([["热门城市", ["hangzhou"]], ["H", ["hangzhou"]]]);
    expect(buildCityPickerGroups("wulumuqi").flatMap((group) => group.cities.map((city) => city.id))).toEqual(["urumqi"]);
    expect(buildCityPickerGroups("xianggang").flatMap((group) => group.cities.map((city) => city.id))).toEqual(["hongkong"]);
    expect(buildCityPickerGroups("  广东省 ").map((group) => [group.label, group.cities.map((city) => city.id)])).toEqual([["热门城市", ["guangzhou"]], ["G", ["guangzhou"]], ["S", ["shenzhen"]]]);
    expect(buildCityPickerGroups("台北").map((group) => group.label)).toEqual(["T"]);
    expect(buildCityPickerGroups("没有这个地方")).toEqual([]);
  });
});
