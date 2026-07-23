import { cityRegistry, cities, type City } from "../../types/city";

type CityContent = { name: string; subtitle: string; souvenir: string; color: string };

const existingContent: Partial<Record<City, CityContent>> = {
  hangzhou: {
    name: "杭州",
    subtitle: "把西湖边的慢时光收进册页",
    souvenir: "西湖莲影纪念钥匙",
    color: "#DDEBDD",
  },
  shanghai: {
    name: "上海",
    subtitle: "把城市灯光留在两个人的夜晚",
    souvenir: "外滩天际线纪念钥匙",
    color: "#F3E1D8",
  },
  shenzhen: {
    name: "深圳",
    subtitle: "把海风和新鲜感装进下一次出发",
    souvenir: "海湾科技线纪念钥匙",
    color: "#DDEBF4",
  },
};

const colorsByKind = {
  "autonomous-region-capital": "#E7E4F5",
  "legacy-city": "#DDEBF4",
  municipality: "#F3E1D8",
  "province-capital": "#DDEBDD",
} as const;

export const cityContent: Record<City, CityContent> = Object.fromEntries(cities.map((city) => {
  const entry = cityRegistry.find((candidate) => candidate.id === city)!;
  return [city, existingContent[city] ?? {
    name: entry.name,
    subtitle: `把${entry.name}的旅行时光收进册页`,
    souvenir: `${entry.name}城市旅行纪念`,
    color: colorsByKind[entry.kind],
  }];
})) as Record<City, CityContent>;

