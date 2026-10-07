import { colors } from '../../components/ui';
import { headingFontFamily } from '../typography/fonts';
import { getCityContent } from './city-content';
import { labelFramesOverlap, resolveCityLabelEdgeOpacity, type CityLabelFrame } from './city-label-layout';
import { wrapLongitude, type GlobalPlace, type GlobalRegion } from './global-map-domain';
import { worldCountryData } from './world-country-data';

/** Shared domestic-map visual language, independent of geographic coverage. */
export const travelMapTheme = Object.freeze({
  land: colors.paper, sea: colors.accentSoft, boundary: colors.accent,
  markerSize: 8, hitSize: 44, clusterSize: 20,
  labelFont: headingFontFamily, labelPaper: 'rgba(239, 226, 207, 0.78)',
});
export type GlobalMapLabel = GlobalPlace & {
  id: string; text: string; kind: 'city' | 'country'; frame: CityLabelFrame; opacity: number;
};

export function resolveGlobalMapLabels(places: readonly GlobalPlace[], region: GlobalRegion,
  size: { width: number; height: number }, visited: readonly string[], visibleCityIds?: ReadonlySet<string>, obstacles: readonly CityLabelFrame[] = []): GlobalMapLabel[] {
  if (size.width <= 0 || size.height <= 0) return [];
  const visitedSet = new Set(visited);
  const scale = 360 / Math.max(0.00001, region.longitudeDelta);
  const candidates = [
    ...worldCountryData.filter(c => scale < 128 && (c.labelRank <= 2 || scale >= (c.labelRank <= 4 ? 2 : 4)))
      .map(c => ({ id: `country:${c.id}`, latitude: c.latitude, longitude: c.longitude, city: c.id, kind: 'country' as const, text: c.name, priority: 3 + c.minLabel / 10, importance: c.importance })),
    ...places.filter(p => (scale >= 1.6 || visitedSet.has(p.city)) && (!visibleCityIds || visibleCityIds.has(p.city)))
      .map(p => ({ ...p, id: p.city, kind: 'city' as const, text: getCityContent(p.city).name, priority: visitedSet.has(p.city) ? 0 : 1, importance: 0 })),
  ].flatMap(label => {
    const x = size.width / 2 + wrapLongitude(label.longitude - region.longitude) / region.longitudeDelta * size.width;
    const y = size.height / 2 - (label.latitude - region.latitude) / region.latitudeDelta * size.height - (label.kind === 'city' ? 20 : 0);
    const opacity = resolveCityLabelEdgeOpacity(x, y, size);
    if (opacity <= 0) return [];
    const fontSize = label.kind === 'city' ? 13 : 11;
    const textWidth = Array.from(label.text).reduce((sum, char) => sum + (/[^\x00-\x7f]/u.test(char) ? fontSize : fontSize * 0.58), 0);
    const width = Math.max(28, textWidth + 10);
    const frame = { x: x - width / 2, y: y - 12, width, height: 24 };
    if (frame.x < 0 || frame.y < 0 || frame.x + width > size.width || frame.y + 24 > size.height) return [];
    return [{ ...label, frame, opacity, distance: (x - size.width / 2) ** 2 + (y - size.height / 2) ** 2 }];
  }).sort((a, b) => a.priority - b.priority || b.importance - a.importance || a.distance - b.distance || a.id.localeCompare(b.id));
  const selected: GlobalMapLabel[] = [];
  const maximum = Math.min(24, Math.max(8, Math.floor(size.width * size.height / 18000)));
  for (const candidate of candidates) {
    if (selected.length >= maximum) break;
    if (obstacles.some(frame => labelFramesOverlap(frame, candidate.frame)) || selected.some(label => labelFramesOverlap(label.frame, candidate.frame))) continue;
    selected.push(candidate);
  }
  return selected;
}
