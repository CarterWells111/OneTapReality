import type { ImageSourcePropType } from "react-native";

import type { City } from "../../types/city";

type MapCheckinAsset = {
  readonly source: ImageSourcePropType;
};

const mapCheckinAssets: Partial<Record<City, MapCheckinAsset>> = {
  beijing: { source: require("../../../assets/map-checkins/beijing.png") },
  changsha: { source: require("../../../assets/map-checkins/changsha.png") },
  chengdu: { source: require("../../../assets/map-checkins/chengdu.png") },
  guangzhou: { source: require("../../../assets/map-checkins/guangzhou.png") },
  hangzhou: { source: require("../../../assets/map-checkins/hangzhou.png") },
  shanghai: { source: require("../../../assets/map-checkins/shanghai.png") },
  shenzhen: { source: require("../../../assets/map-checkins/shenzhen.png") },
  suzhou: { source: require("../../../assets/map-checkins/suzhou.png") },
  wuhan: { source: require("../../../assets/map-checkins/wuhan.png") },
  xian: { source: require("../../../assets/map-checkins/xian.png") },
};

export function getMapCheckinAsset(city: City) {
  return mapCheckinAssets[city] ?? null;
}

export const mapCheckinAssetCities = Object.freeze(Object.keys(mapCheckinAssets) as City[]);
