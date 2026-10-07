import { createGeographicCity, resolveCityEntry, cityRegistry } from '../src/types/city';
import { projectWorldCoordinate, fitGlobalRegion, clusterGlobalPlaces } from '../src/features/cities/global-map-domain';
import { getCityStats } from '../src/features/cities/city-stats';
import { getCityContent } from '../src/features/cities/city-content';
import { resolveCityRouteParam } from '../src/features/cities/city-route';
import { parseCloudMemoryPayload } from '../src/server/validation';
import { DemoDraftGenerator } from '../src/services/ai/demo-draft-generator';

const locations = [
  { name: 'London', latitude: 51.5074, longitude: -0.1278 },
  { name: 'Shanghai', latitude: 31.2304, longitude: 121.4737 },
  { name: 'New York', latitude: 40.7128, longitude: -74.006 },
  { name: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
  { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241 },
  { name: 'Lima', latitude: -12.0464, longitude: -77.0428 },
];

describe('Global geographic places', () => {
  it.each(locations)('round trips $name through routes, content, stats and cloud validation', (place) => {
    const city = createGeographicCity(place);
    expect(resolveCityEntry(city)).toMatchObject({ name: place.name, geographic: { latitude: place.latitude, longitude: place.longitude } });
    expect(resolveCityRouteParam(city)).toBe(city);
    expect(getCityContent(city).name).toBe(place.name);
    expect(getCityStats([{ city, status: 'saved' }, { city, status: 'draft' }]).find(s => s.city === city)).toMatchObject({ visitCount: 1 });
    expect(parseCloudMemoryPayload({ title: place.name, city, travelDate: '2026-10-01', status: 'saved', photoCount: 0, pages: [] }).city).toBe(city);
  });
  it('has source-backed searchable places in both hemispheres and all populated continents', () => {
    expect(cityRegistry.length).toBeGreaterThan(200);
    for (const place of locations) expect(cityRegistry.some(c => c.name === place.name || c.aliases?.includes(place.name))).toBe(true);
  });
  it.each([NaN, Infinity, -91, 91])('rejects invalid latitude %s', latitude => {
    expect(() => createGeographicCity({ name: 'Invalid', latitude, longitude: 0 })).toThrow();
  });
  it.each([NaN, Infinity, -181, 181])('rejects invalid longitude %s', longitude => {
    expect(() => createGeographicCity({ name: 'Invalid', latitude: 0, longitude })).toThrow();
  });
  it.each([-90, 90])('keeps polar latitude %s finite', latitude => {
    expect(projectWorldCoordinate({ latitude, longitude: 180 })).toEqual({ x: 1, y: latitude === 90 ? 0 : 1 });
    expect(resolveCityEntry(createGeographicCity({ name: 'Pole', latitude, longitude: 180 }))?.geographic.latitude).toBe(latitude);
  });
  it('rejects malformed geographic IDs and empty names', () => {
    expect(resolveCityEntry('geo:1:NaN:0:Bad')).toBeUndefined();
    expect(resolveCityRouteParam('geo:1:NaN:0:Bad')).toBe('hangzhou');
    expect(() => createGeographicCity({ name: ' ', latitude: 0, longitude: 0 })).toThrow();
  });
  it('fits points across the date line without choosing the long way around', () => {
    const region = fitGlobalRegion([{ latitude: -16, longitude: 179 }, { latitude: -17, longitude: -179 }]);
    expect(Math.abs(region.longitude)).toBe(180);
    expect(region.longitudeDelta).toBeLessThan(4);
    expect(region.latitudeDelta).toBeLessThan(2);
    expect(fitGlobalRegion([]).longitudeDelta).toBe(360);
  });
  it('clusters date-line neighbours and expands them at street zoom', () => {
    const places = [179.99, -179.99].map((longitude, i) => ({ city: `place-${i}`, latitude: 0, longitude }));
    const region = { latitude: 0, longitude: 180, latitudeDelta: 100, longitudeDelta: 360 };
    expect(clusterGlobalPlaces(places, region, { width: 390, height: 844 })).toHaveLength(1);
    expect(clusterGlobalPlaces(places, { ...region, longitudeDelta: 0.04 }, { width: 390, height: 844 })).toHaveLength(2);
  });
  it('uses custom-place names in the existing local draft generator', async () => {
    const city = createGeographicCity(locations[3]);
    const pages = await new DemoDraftGenerator().generate({ title: 'Trip', city, travelDate: '2026-10-01', photoUris: [] });
    expect(pages[0].body).toContain('Sydney');
    expect(pages[0].body).not.toContain('undefined');
  });
});
