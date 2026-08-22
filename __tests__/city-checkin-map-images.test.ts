import { existsSync } from "node:fs";
import * as path from "node:path";

import { checkinMapCities, getCityCheckinMapImage } from "../src/features/cities/city-checkin-map-images";

describe("city check-in map images", () => {
  it("registers exactly the ten curated check-in map cities", () => {
    expect(checkinMapCities).toEqual([
      "beijing",
      "shanghai",
      "chengdu",
      "hangzhou",
      "guangzhou",
      "xian",
      "wuhan",
      "shenzhen",
      "changsha",
      "chongqing",
    ]);
  });

  it("resolves an image for every registered city and null for cities without one", () => {
    for (const city of checkinMapCities) {
      expect(getCityCheckinMapImage(city)).toBeTruthy();
      // 确保重命名后 asset 文件真实存在，防止引用断裂
      expect(existsSync(path.join(__dirname, "..", "assets", "city-checkin", `${city}-map.png`))).toBe(true);
    }

    // 拉萨/南京/昆明/哈尔滨等城市没有接入打卡地图大图
    expect(getCityCheckinMapImage("lhasa")).toBeNull();
    expect(getCityCheckinMapImage("nanjing")).toBeNull();
    expect(getCityCheckinMapImage("kunming")).toBeNull();
    expect(getCityCheckinMapImage("harbin")).toBeNull();
    expect(getCityCheckinMapImage("luoyang")).toBeNull();
  });

  it("keeps the registry frozen so accidental edits cannot break the city→image mapping", () => {
    expect(Object.isFrozen(checkinMapCities)).toBe(true);
  });
});
