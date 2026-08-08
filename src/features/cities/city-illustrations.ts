import type { ImageSourcePropType } from "react-native";

import type { City } from "../../types/city";
import { getCityCheckinImage } from "./city-checkin-images";

/**
 * 城市卡片 / 城市详情页顶部视觉：
 * 优先使用手绘打卡地图（10 城）；有专属水彩宣传图的非打卡城市退回水彩图；
 * 其余城市显示线稿占位符。
 */
const featuredCityIllustrations: Readonly<Record<string, ImageSourcePropType>> = {
  shanghai: require("../../../assets/cities/shanghai-card-watercolor.png"),
  shenzhen: require("../../../assets/cities/shenzhen-card-watercolor.png"),
  hangzhou: require("../../../assets/cities/hangzhou-card-watercolor.png"),
  nanjing: require("../../../assets/cities/nanjing-card-watercolor.png"),
  beijing: require("../../../assets/cities/beijing-card-watercolor.png"),
  hongkong: require("../../../assets/cities/hongkong-card-watercolor.png"),
};

export const featuredCityIds = Object.keys(featuredCityIllustrations) as readonly string[];

export type CityCardVisual =
  | { readonly kind: "illustration"; readonly source: ImageSourcePropType }
  | { readonly kind: "placeholder" };

export function getCityCardVisual(city: City): CityCardVisual {
  const checkinImage = getCityCheckinImage(city);
  if (checkinImage) {
    return { kind: "illustration", source: checkinImage };
  }
  if (city in featuredCityIllustrations) {
    return { kind: "illustration", source: featuredCityIllustrations[city] };
  }
  return { kind: "placeholder" };
}
