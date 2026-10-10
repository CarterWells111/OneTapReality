import { cityRegistry, type City, type CityRegistryEntry } from "../../types/city";

/**
 * 创建纪念册时置顶的热门旅游城市。
 *
 * 取自 2026 年五一、暑期、春节国内游与春节入境游的多平台预订榜单交叉统计：
 * 北京、上海、成都、重庆、杭州在各榜单稳定出现，广州次之。榜单口径不同，栏内顺序暂定，
 * 不作为产品要求；这些城市同时保留在各自的拼音首字母栏里，方便按字母查找。
 */
export const trendingCityOrder = ["beijing", "shanghai", "chengdu", "chongqing", "hangzhou", "guangzhou"] as const satisfies readonly City[];

export const trendingCityGroupLabel = "热门城市";

export type CityPickerGroup = {
  readonly key: string;
  readonly label: string;
  readonly cities: readonly CityRegistryEntry[];
};

function matchesQuery(entry: CityRegistryEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return [entry.id, entry.name, entry.region, entry.pinyin]
    .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}

function pinyinInitial(entry: CityRegistryEntry): string {
  return entry.pinyin.slice(0, 1).toLocaleUpperCase();
}

/**
 * 城市选择列表的分组：热门城市在前，全部城市按拼音首字母分栏、栏内按拼音排序。
 * 热门城市在字母栏里保留一份，传入搜索词时只保留命中的城市，空分组不返回。
 */
export function buildCityPickerGroups(query = ""): CityPickerGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matched = cityRegistry.filter((entry) => matchesQuery(entry, normalizedQuery));

  const trending = trendingCityOrder.flatMap((id) => matched.filter((entry) => entry.id === id));
  const byInitial = new Map<string, CityRegistryEntry[]>();
  for (const entry of matched) {
    const initial = pinyinInitial(entry);
    const group = byInitial.get(initial);
    if (group) group.push(entry);
    else byInitial.set(initial, [entry]);
  }

  const letterGroups = [...byInitial.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([initial, entries]) => ({
      key: initial,
      label: initial,
      cities: [...entries].sort((left, right) => left.pinyin.localeCompare(right.pinyin)),
    }));

  return trending.length > 0
    ? [{ key: "trending", label: trendingCityGroupLabel, cities: trending }, ...letterGroups]
    : letterGroups;
}
