import { cityRegistry, resolveCityEntry } from '../../types/city';
import type { CityStats } from './city-stats';
import { fitGlobalRegion, type GlobalPlace } from './global-map-domain';
import { colors } from '../../components/ui';
import { getCityVisitIntensity } from './city-stats';

export function globalMarkerColors(count: number) {
  const intensity = getCityVisitIntensity(count);
  return {
    backgroundColor: intensity === 'strong' ? colors.warmAccent : intensity === 'none' ? colors.surface : colors.accentSoft,
    borderColor: intensity === 'strong' ? colors.ink : intensity === 'medium' ? colors.warmAccent : intensity === 'none' ? colors.line : colors.accent,
  };
}

export function getGlobalPlaces(stats: readonly CityStats[]): GlobalPlace[] {
  const ids = new Set([...cityRegistry.map(c => c.id), ...stats.map(s => s.city)]);
  return [...ids].flatMap(city => {
    const entry = resolveCityEntry(city);
    return entry ? [{ city, ...entry.geographic }] : [];
  });
}

export function getInitialGlobalRegion(stats: readonly CityStats[], initialCity?: string) {
  const initial = resolveCityEntry(initialCity);
  if (initial) return { ...initial.geographic, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  return fitGlobalRegion(stats.filter(s => s.isVisited).flatMap(s => {
    const entry = resolveCityEntry(s.city);
    return entry ? [entry.geographic] : [];
  }));
}
