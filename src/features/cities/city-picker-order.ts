import type { CityRegistryEntry } from '../../types/city';
import { popularCityOrder } from './city-archive';
import { cityPinyinKeys } from './city-pinyin.generated';

type SearchableCity = CityRegistryEntry & { readonly aliases?: readonly string[] };
type PinyinKeys = Readonly<Record<string, { name: string; key: string; initial: string }>>;
export type CityPickerGroup = { label: string; cities: SearchableCity[] };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function getCityPickerGroups(entries: readonly SearchableCity[], query = '', keys: PinyinKeys = cityPinyinKeys): CityPickerGroup[] {
  const search = query.trim().toLowerCase();
  const matching = entries.filter(c => !search || [c.id,c.name,c.region,...(c.aliases ?? [])].some(v => v.toLowerCase().includes(search)));
  const popular = popularCityOrder.flatMap(id => matching.filter(c => c.id === id));
  const popularIds = new Set<string>(popularCityOrder);
  const other = matching.filter(c => !popularIds.has(c.id));
  for (const city of other) {
    if (!keys[city.id] || keys[city.id].name !== city.name) throw new Error(`Regenerate city pinyin data: ${city.id}`);
  }
  other.sort((a,b) => compare(keys[a.id].key,keys[b.id].key) || compare(a.id,b.id));
  const groups = new Map<string, SearchableCity[]>();
  for (const city of other) {
    const initial = keys[city.id].initial;
    groups.set(initial,[...(groups.get(initial) ?? []),city]);
  }
  return [
    ...(popular.length ? [{label:'热门城市',cities:popular}] : []),
    ...[...groups].sort(([a],[b]) => a === '#' ? 1 : b === '#' ? -1 : compare(a,b)).map(([label,cities]) => ({label,cities})),
  ];
}
