import { getCityContent } from "../../features/cities/city-content";
import type { City } from "../../types/memory";

export class CityKeyResolver {
  resolve(city: City) {
    return {
      city,
      title: `${getCityContent(city).name}记忆钥匙`,
      message: `已打开${getCityContent(city).name}城市记忆预览。`,
    };
  }
}

