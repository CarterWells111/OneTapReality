import { resolveGlobalMapLabels, travelMapTheme } from '../src/features/cities/global-map-style';
import { colors } from '../src/components/ui';
import { headingFontFamily } from '../src/features/typography/fonts';
import { getGlobalPlaces } from '../src/features/cities/global-map-places';

describe('Domestic travel map style on global coordinates', () => {
  it('reuses paper, terracotta boundaries, heading font and fixed-size markers', () => {
    expect(travelMapTheme).toMatchObject({ land: colors.paper, sea: colors.accentSoft, boundary: colors.accent,
      markerSize: 8, hitSize: 44, labelFont: headingFontFamily });
  });
  it('reveals named city labels at city zoom while keeping a quiet world overview', () => {
    const places = getGlobalPlaces([]);
    const world = { latitude: 0, longitude: 0, latitudeDelta: 180, longitudeDelta: 360 };
    expect(resolveGlobalMapLabels(places, world, { width: 390, height: 844 }, []).filter(l => l.kind === 'city')).toHaveLength(0);
    const shanghai = places.find(p => p.city === 'shanghai')!;
    const labels = resolveGlobalMapLabels(places, { ...shanghai, latitudeDelta: 0.12, longitudeDelta: 0.08 }, { width: 390, height: 844 }, []);
    expect(labels).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'shanghai', text: '上海' })]));
  });
  it('keeps the visible label frames apart and within the domestic map central window', () => {
    const labels = resolveGlobalMapLabels(getGlobalPlaces([]), { latitude: 45, longitude: 10, latitudeDelta: 40, longitudeDelta: 60 }, { width: 390, height: 844 }, []);
    for (const a of labels) {
      expect(a.frame.x).toBeGreaterThanOrEqual(0);
      expect(a.frame.x + a.frame.width).toBeLessThanOrEqual(390);
      for (const b of labels) if (a.id !== b.id) {
        expect(a.frame.x + a.frame.width + 4 <= b.frame.x || b.frame.x + b.frame.width + 4 <= a.frame.x || a.frame.y + a.frame.height + 4 <= b.frame.y || b.frame.y + b.frame.height + 4 <= a.frame.y).toBe(true);
      }
    }
  });
  it('keeps country names clear of footprint badges', () => {
    const region = { latitude: 0, longitude: 0, latitudeDelta: 180, longitudeDelta: 360 };
    const size = { width: 390, height: 844 };
    expect(resolveGlobalMapLabels([], region, size, [], undefined, [{ x: 0, y: 0, width: 390, height: 844 }])).toHaveLength(0);
  });
  it('prioritizes broad world labels before nearby minor labels', () => {
    const labels = resolveGlobalMapLabels([], { latitude: 0, longitude: 0, latitudeDelta: 720, longitudeDelta: 360 }, { width: 390, height: 780 }, []);
    expect(labels.map(l => l.text)).toEqual(expect.arrayContaining(['中国', '美国', '俄罗斯']));
  });
});
