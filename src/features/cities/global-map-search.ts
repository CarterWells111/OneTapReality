import { cityRegistry, resolveCityEntry } from '../../types/city';

export function getGlobalSearchEntries(savedCities: readonly string[] = []) {
  return [...new Set([...cityRegistry.map(c => c.id), ...savedCities])].flatMap(id => {
    const entry = resolveCityEntry(id);
    return entry ? [{ id, name: entry.name, terms: [entry.id, entry.name, entry.region, ...(entry.aliases ?? [])].join(' ').toLocaleLowerCase() }] : [];
  });
}
