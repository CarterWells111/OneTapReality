export type GeographicCoordinate = { readonly latitude: number; readonly longitude: number };
export type GlobalRegion = GeographicCoordinate & { readonly latitudeDelta: number; readonly longitudeDelta: number };
export type GlobalPlace = GeographicCoordinate & { readonly city: string };

export function isGeographicCoordinate(value: GeographicCoordinate): boolean {
  return Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}

export function projectWorldCoordinate(value: GeographicCoordinate) {
  if (!isGeographicCoordinate(value)) throw new Error('Invalid geographic coordinates');
  return { x: (value.longitude + 180) / 360, y: (90 - value.latitude) / 180 };
}

export function wrapLongitude(longitude: number) {
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && longitude > 0 ? 180 : wrapped;
}

/** Fit the complement of the largest gap, rather than min/max longitude. */
export function fitGlobalRegion(points: readonly GeographicCoordinate[]): GlobalRegion {
  const valid = points.filter(isGeographicCoordinate);
  if (!valid.length) return { latitude: 0, longitude: 0, latitudeDelta: 180, longitudeDelta: 360 };
  const longitudes = valid.map(p => (p.longitude + 360) % 360).sort((a, b) => a - b);
  let gap = -1; let start = longitudes[0];
  for (let i = 0; i < longitudes.length; i++) {
    const next = i === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[i + 1];
    if (next - longitudes[i] > gap) { gap = next - longitudes[i]; start = next % 360; }
  }
  const latitudes = valid.map(p => p.latitude);
  const minLat = Math.min(...latitudes); const maxLat = Math.max(...latitudes);
  return {
    latitude: (minLat + maxLat) / 2, longitude: wrapLongitude(start + (360 - gap) / 2),
    latitudeDelta: Math.min(180, Math.max(0.08, (maxLat - minLat) * 1.35)),
    longitudeDelta: Math.min(360, Math.max(0.08, (360 - gap) * 1.35)),
  };
}

export type GlobalCluster = GeographicCoordinate & { readonly id: string; readonly cities: readonly string[] };

export function hasCoincidentCoordinates(points: readonly GeographicCoordinate[]) {
  const first = points[0];
  return Boolean(first) && points.every(p => Math.abs(p.latitude - first.latitude) < 0.000001 && Math.abs(wrapLongitude(p.longitude - first.longitude)) < 0.000001);
}

/** Linear-time screen-grid grouping, unwrapped around the current camera (also at the date line). */
export function clusterGlobalPlaces(places: readonly GlobalPlace[], region: GlobalRegion, size: { width: number; height: number }): GlobalCluster[] {
  const groups = new Map<string, GlobalPlace[]>();
  for (const place of places) {
    if (!isGeographicCoordinate(place)) continue;
    const dx = wrapLongitude(place.longitude - region.longitude);
    const x = size.width / 2 + dx / Math.max(0.00001, region.longitudeDelta) * size.width;
    const y = size.height / 2 - (place.latitude - region.latitude) / Math.max(0.00001, region.latitudeDelta) * size.height;
    if (x < -44 || x > size.width + 44 || y < -44 || y > size.height + 44) continue;
    const key = `${Math.round(x / 44)}:${Math.round(y / 44)}`;
    const group = groups.get(key);
    if (group) group.push(place); else groups.set(key, [place]);
  }
  return [...groups.values()].map(group => ({
    id: group.map(p => p.city).sort().join('|'), cities: group.map(p => p.city),
    latitude: group.reduce((sum, p) => sum + p.latitude, 0) / group.length,
    longitude: wrapLongitude(region.longitude + group.reduce((sum, p) => sum + wrapLongitude(p.longitude - region.longitude), 0) / group.length),
  }));
}
