/** 城市打卡弹窗底图注册表：静态 require 供 Metro bundler 打包。
 *  每张图对应一个或多个城市，用作足迹弹窗的背景地图。 */

const cityCheckinImages: Record<string, ReturnType<typeof require>> = {
  beijing: require("../../../assets/city-checkin/city-01.png"),
  shanghai: require("../../../assets/city-checkin/city-02.png"),
  hangzhou: require("../../../assets/city-checkin/city-03.png"),
  xian: require("../../../assets/city-checkin/city-04.png"),
  chengdu: require("../../../assets/city-checkin/city-05.png"),
  lhasa: require("../../../assets/city-checkin/city-06.png"),
  guangzhou: require("../../../assets/city-checkin/city-07.png"),
  nanjing: require("../../../assets/city-checkin/city-08.png"),
  kunming: require("../../../assets/city-checkin/city-09.png"),
  harbin: require("../../../assets/city-checkin/city-10.png"),
};

/** 拥有打卡弹窗的城市列表 */
export const checkinCities = Object.keys(cityCheckinImages) as readonly string[];

export function getCityCheckinImage(city: string) {
  return cityCheckinImages[city] ?? null;
}
