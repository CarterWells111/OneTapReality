import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { colors } from '../../components/ui';
import { resolveCityEntry } from '../../types/city';
import type { CityMapProps } from './city-map';
import { getCityContent } from './city-content';
import { clusterGlobalPlaces, fitGlobalRegion, hasCoincidentCoordinates, wrapLongitude } from './global-map-domain';
import { GlobalPlaceChoices } from './global-place-choices';
import { getGlobalPlaces, getInitialGlobalRegion, globalMarkerColors } from './global-map-places';

/** MapKit is the iOS default provider; no Google key or device-location permission. */
export function StreetCityMap({ stats, variant, initialCity, initialRegion: providedRegion, onViewportChange, targetCity, onTargetReached, interactive, onCityPress, onMapPress }: CityMapProps) {
  const mapRef = React.useRef<MapView>(null);
  const [ready, setReady] = React.useState(false);
  const [choices, setChoices] = React.useState<readonly string[]>([]);
  const [size, setSize] = React.useState({ width: 390, height: 300 });
  const initialRegion = React.useRef(providedRegion ? { ...providedRegion, latitudeDelta: Math.min(180, providedRegion.latitudeDelta) } : getInitialGlobalRegion(stats, initialCity)).current;
  const [region, setRegion] = React.useState<Region>(initialRegion);
  const userMoved = React.useRef(false);
  const fittedSaved = React.useRef(Boolean(initialCity || providedRegion) || stats.some(s => s.isVisited));
  const pendingTarget = React.useRef<string | undefined>(undefined);
  const places = React.useMemo(() => getGlobalPlaces(stats), [stats]);
  const clusters = React.useMemo(() => clusterGlobalPlaces(places, region, size), [places, region, size]);
  const counts = new Map(stats.map(s => [s.city, s]));
  React.useEffect(() => {
    if (!ready || fittedSaved.current || userMoved.current || !stats.some(s => s.isVisited)) return;
    fittedSaved.current = true;
    mapRef.current?.animateToRegion(getInitialGlobalRegion(stats), 350);
  }, [ready, stats]);
  React.useEffect(() => {
    if (!targetCity) { pendingTarget.current = undefined; return; }
    if (!ready) return;
    const entry = resolveCityEntry(targetCity);
    if (!entry) return;
    userMoved.current = true;
    pendingTarget.current = targetCity;
    mapRef.current?.animateToRegion({ ...entry.geographic, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 500);
  }, [ready, targetCity]);
  const select = (cities: readonly string[]) => {
    if (cities.length === 1) { if (interactive) onCityPress?.(cities[0]); return; }
    const points = places.filter(p => cities.includes(p.city));
    if (hasCoincidentCoordinates(points) || region.longitudeDelta <= 0.006) { setChoices(cities); return; }
    const fit = fitGlobalRegion(points);
    mapRef.current?.animateToRegion({ ...fit, latitudeDelta: Math.min(fit.latitudeDelta, region.latitudeDelta / 2), longitudeDelta: Math.min(fit.longitudeDelta, region.longitudeDelta / 2) }, 350);
  };
  return (
    <View style={variant === 'overview' ? styles.overview : styles.workspace} testID={`global-map-${variant}`}>
      <MapView
        ref={mapRef}
        accessibilityLabel="全球城市旅行地图"
        initialRegion={initialRegion}
        onLayout={event => setSize(event.nativeEvent.layout)}
        onMapReady={() => setReady(true)}
        onTouchStart={() => { userMoved.current = true; }}
        onRegionChangeComplete={next => {
          setRegion(next);
          onViewportChange?.(next);
          const target = resolveCityEntry(pendingTarget.current);
          if (target && Math.abs(next.latitude - target.geographic.latitude) < 0.1 && Math.abs(wrapLongitude(next.longitude - target.geographic.longitude)) < 0.1) {
            pendingTarget.current = undefined;
            onTargetReached?.();
          }
        }}
        scrollEnabled={variant === 'workspace'}
        zoomEnabled={variant === 'workspace'}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={false}
        showsPointsOfInterests={false}
        showsCompass={variant === 'workspace'}
        mapType="standard"
        style={StyleSheet.absoluteFill}
        testID="global-native-map"
      >
        {clusters.map(cluster => {
          const city = cluster.cities[0];
          const count = cluster.cities.reduce((sum, id) => sum + (counts.get(id)?.visitCount ?? 0), 0);
          const label = cluster.cities.length === 1 ? `${getCityContent(city).name}，已保存 ${count} 册旅行记忆` : `${cluster.cities.length} 个地点，点击放大`;
          return (
            <Marker key={cluster.id} identifier={cluster.id} coordinate={cluster} onPress={() => select(cluster.cities)} tracksViewChanges={false} accessibilityLabel={label} testID={`global-marker-${city}`}>
              <View style={styles.markerTarget}><View style={[styles.marker, globalMarkerColors(count), cluster.cities.length > 1 && styles.cluster]}>
                {cluster.cities.length > 1 ? <Text style={styles.count}>{cluster.cities.length}</Text> : null}
              </View></View>
            </Marker>
          );
        })}
      </MapView>
      {onMapPress ? <Pressable accessibilityRole="button" accessibilityLabel="全屏查看全球地图" onPress={onMapPress} style={styles.fullscreen}><Text style={styles.buttonText}>全屏查看</Text></Pressable> : null}
      {choices.length ? <GlobalPlaceChoices cities={choices} onClose={() => setChoices([])} onSelect={city => { setChoices([]); if (interactive) onCityPress?.(city); }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overview: { height: 230, borderRadius: 20, overflow: 'hidden' },
  workspace: { flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden' },
  markerTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  marker: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1.5, borderRadius: 4, width: 8, height: 8 },
  cluster: { borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  count: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  fullscreen: { position: 'absolute', right: 12, top: 12, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 16, backgroundColor: colors.surface },
  buttonText: { color: colors.accent, fontWeight: '800' },
});
