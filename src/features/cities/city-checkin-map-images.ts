import type { ImageSourcePropType } from "react-native";

import type { City } from "../../types/city";

/** 拥有"城市打卡地图"插画大图的城市（固定 10 城，与 assets/city-checkin/<city>-map.png 一一对应）。
 *  这些图是手绘的城市足迹打卡地图，与 assets/cities/*-card-watercolor.png（城市名片封面）是两套不同的图。 */
export const checkinMapCities: readonly City[] = Object.freeze([
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
] as const satisfies readonly City[]);

/** 城市 → 打卡地图插画大图（static require 供 Metro 打包）。 */
const cityCheckinMapImages: Readonly<Partial<Record<City, ImageSourcePropType>>> = {
  beijing: require("../../../assets/city-checkin/beijing-map.png"),
  shanghai: require("../../../assets/city-checkin/shanghai-map.png"),
  chengdu: require("../../../assets/city-checkin/chengdu-map.png"),
  hangzhou: require("../../../assets/city-checkin/hangzhou-map.png"),
  guangzhou: require("../../../assets/city-checkin/guangzhou-map.png"),
  xian: require("../../../assets/city-checkin/xian-map.png"),
  wuhan: require("../../../assets/city-checkin/wuhan-map.png"),
  shenzhen: require("../../../assets/city-checkin/shenzhen-map.png"),
  changsha: require("../../../assets/city-checkin/changsha-map.png"),
  chongqing: require("../../../assets/city-checkin/chongqing-map.png"),
};

/** 返回城市的打卡地图大图；未接入的城市返回 null（调用方回退到城市记忆页）。 */
export function getCityCheckinMapImage(city: string): ImageSourcePropType | null {
  return cityCheckinMapImages[city as City] ?? null;
}
