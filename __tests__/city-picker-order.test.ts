import { cityRegistry } from '../src/types/city';
import { popularCityOrder } from '../src/features/cities/city-archive';
import { getCityPickerGroups } from '../src/features/cities/city-picker-order';
import { cityPinyinKeys } from '../src/features/cities/city-pinyin.generated';

it('puts configured popular cities first exactly once and covers the whole registry', () => {
  const groups = getCityPickerGroups(cityRegistry);
  expect(groups[0].label).toBe('热门城市');
  expect(groups[0].cities.map(c => c.id)).toEqual(popularCityOrder);
  const ids = groups.flatMap(g => g.cities.map(c => c.id));
  expect(new Set(ids).size).toBe(cityRegistry.length);
  expect([...ids].sort()).toEqual(cityRegistry.map(c => c.id).sort());
  expect(Object.keys(cityPinyinKeys).sort()).toEqual(cityRegistry.map(c => c.id).sort());
});

it('sorts complete pinyin rather than initials, including place-name readings', () => {
  const groups = getCityPickerGroups(cityRegistry);
  expect(groups.find(g => g.label === 'C')?.cities.map(c => c.id)).toEqual(['changchun', 'changsha', 'chengdu', 'chongqing']);
  expect(cityPinyinKeys.changchun.key).toBe('changchun');
  expect(cityPinyinKeys.changsha.key).toBe('changsha');
  expect(cityPinyinKeys.chongqing.key).toBe('chongqing');
});

it('keeps ordering after Chinese, English and alias search and ID tie breaks', () => {
  expect(getCityPickerGroups(cityRegistry, '长').flatMap(g => g.cities.map(c => c.id))).toEqual(['changchun', 'changsha']);
  expect(getCityPickerGroups(cityRegistry, 'BEIJING')[0].cities[0].id).toBe('beijing');
  const cities = [
    { ...cityRegistry[0], id: 'tie-b', name: '北京', aliases: ['Peking'] },
    { ...cityRegistry[0], id: 'tie-a', name: '北京', aliases: ['Peking'] },
  ];
  const keys = { 'tie-a': { name: '北京', key: 'beijing', initial: 'B' }, 'tie-b': { name: '北京', key: 'beijing', initial: 'B' } };
  expect(getCityPickerGroups(cities, 'peking', keys).flatMap(g => g.cities.map(c => c.id))).toEqual(['tie-a', 'tie-b']);
});
