import type { ImageSourcePropType } from "react-native";

import type { City } from "../../types/city";

export const featuredCityIds = ["shanghai", "shenzhen", "hangzhou", "nanjing", "beijing", "hongkong"] as const satisfies readonly City[];

const featuredCityIllustrations: Readonly<Record<(typeof featuredCityIds)[number], ImageSourcePropType>> = {
  shanghai: require("../../../assets/cities/shanghai-card-watercolor.png"),
  shenzhen: require("../../../assets/cities/shenzhen-card-watercolor.png"),
  hangzhou: require("../../../assets/cities/hangzhou-card-watercolor.png"),
  nanjing: require("../../../assets/cities/nanjing-card-watercolor.png"),
  beijing: require("../../../assets/cities/beijing-card-watercolor.png"),
  hongkong: require("../../../assets/cities/hongkong-card-watercolor.png"),
};

export type CityCardVisual =
  | { readonly kind: "illustration"; readonly source: ImageSourcePropType }
  | { readonly kind: "generic" };

export function getCityCardVisual(city: City): CityCardVisual {
  if (city in featuredCityIllustrations) {
    return { kind: "illustration", source: featuredCityIllustrations[city as (typeof featuredCityIds)[number]] };
  }
  return { kind: "generic" };
}
