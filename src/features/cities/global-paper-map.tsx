import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { colors } from '../../components/ui';
import { resolveCityEntry } from '../../types/city';
import type { CityMapProps } from './city-map';
import { getCityContent } from './city-content';
import { clusterGlobalPlaces, fitGlobalRegion, hasCoincidentCoordinates, wrapLongitude, type GlobalCluster, type GlobalRegion } from './global-map-domain';
import { GlobalPlaceChoices } from './global-place-choices';
import { getGlobalPlaces, getInitialGlobalRegion, globalMarkerColors } from './global-map-places';
import { worldLandPaths, worldMapViewBox } from './world-land-data';
import { worldCountryData } from './world-country-data';
import { resolveGlobalMapLabels, travelMapTheme, type GlobalMapLabel } from './global-map-style';
import { resolveCityLabelEdgeOpacity } from './city-label-layout';

type Shared = { value: number };

export function clampGlobalViewport(viewport: { scale: number; x: number; y: number }, size: { width: number; height: number }) {
  'worklet';
  const scale = Math.min(65536, Math.max(1, viewport.scale));
  const w = Math.max(1, Math.min(size.width, size.height * 2));
  const limit = w * scale / 2;
  return { scale, x: ((viewport.x + limit) % (2 * limit) + 2 * limit) % (2 * limit) - limit,
    y: Math.min(limit / 2, Math.max(-limit / 2, viewport.y)) };
}

/** Shared native/UI-thread math; all content uses the same 2:1 world coordinate space. */
export function globalMapScreenPoint(point: { latitude: number; longitude: number }, viewport: { scale: number; x: number; y: number }, size: { width: number; height: number }) {
  'worklet';
  const w = Math.min(size.width, size.height * 2); const h = w / 2;
  const centerLon = -viewport.x / Math.max(1, w * viewport.scale) * 360;
  const dx = ((point.longitude - centerLon + 180) % 360 + 360) % 360 - 180;
  return { x: size.width / 2 + dx / 360 * w * viewport.scale,
    y: size.height / 2 - point.latitude / 180 * h * viewport.scale + viewport.y };
}

function ClusterDot({ cluster, scale, x, y, width, height, count, onPress }: {
  cluster: GlobalCluster; scale: Shared; x: Shared; y: Shared; width: Shared; height: Shared; count: number; onPress: () => void;
}) {
  const animated = useAnimatedStyle(() => {
    const p = globalMapScreenPoint(cluster, { scale: scale.value, x: x.value, y: y.value }, { width: width.value, height: height.value });
    return { left: p.x - 22, top: p.y - 22 };
  });
  const grouped = cluster.cities.length > 1;
  return <Animated.View style={[styles.markerTarget, animated]}>
    <Pressable accessibilityRole="button" accessibilityLabel={grouped ? `${cluster.cities.length} 个地点，点击放大` : `${getCityContent(cluster.cities[0]).name}，已保存 ${count} 册旅行记忆`} onPress={onPress} style={styles.markerPress} testID={`global-marker-${cluster.cities[0]}`}>
      <View style={[styles.dot, globalMarkerColors(count), grouped && styles.cluster]}>{grouped ? <Text style={styles.count}>{cluster.cities.length}</Text> : null}</View>
    </Pressable>
  </Animated.View>;
}

function PaperMapLabel({ label, scale, x, y, width, height }: { label: GlobalMapLabel; scale: Shared; x: Shared; y: Shared; width: Shared; height: Shared }) {
  const labelWidth = label.frame.width;
  const offset = label.kind === 'city' ? 20 : 0;
  const animated = useAnimatedStyle(() => {
    const size = { width: width.value, height: height.value };
    const point = globalMapScreenPoint(label, { scale: scale.value, x: x.value, y: y.value }, size);
    return { left: point.x - labelWidth / 2, top: point.y - offset - 12,
      opacity: resolveCityLabelEdgeOpacity(point.x, point.y - offset, size) };
  });
  return <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.label, { width: labelWidth }, animated]} testID={`global-map-label-${label.id}`}>
    <Text numberOfLines={1} style={[styles.labelText, label.kind === 'city' && styles.cityLabel]}>{label.text}</Text>
  </Animated.View>;
}

export function GlobalPaperMap({ stats, variant, initialCity, initialRegion, onViewportChange, targetCity, onTargetReached, interactive, onCityPress, onMapPress }: CityMapProps) {
  const initial = React.useRef(initialRegion ?? getInitialGlobalRegion(stats, initialCity)).current;
  const [size, setSize] = React.useState({ width: 390, height: 230 });
  const [region, setRegion] = React.useState<GlobalRegion>(initial);
  const [choices, setChoices] = React.useState<readonly string[]>([]);
  const scale = useSharedValue(1); const x = useSharedValue(0); const y = useSharedValue(0);
  const cameraProgress = useSharedValue(0);
  const startScale = useSharedValue(1); const startX = useSharedValue(0); const startY = useSharedValue(0);
  const focalX = useSharedValue(0); const focalY = useSharedValue(0);
  const width = useSharedValue(390); const height = useSharedValue(230);
  const applied = React.useRef(false);
  const pendingCamera = React.useRef<{ region: GlobalRegion; reached?: () => void; generation: number } | null>(null);
  const cameraGeneration = React.useRef(0);
  const userMoved = React.useRef(false);
  const fittedSaved = React.useRef(Boolean(initialCity || initialRegion) || stats.some(s => s.isVisited));
  const markInteraction = React.useCallback(() => { userMoved.current = true; pendingCamera.current = null; cameraGeneration.current += 1; }, []);
  const places = React.useMemo(() => getGlobalPlaces(stats), [stats]);
  const visitedIds = React.useMemo(() => new Set(stats.filter(s => s.isVisited).map(s => s.city)), [stats]);
  const worldView = region.longitudeDelta > 360 / 1.6;
  const clusters = React.useMemo(() => clusterGlobalPlaces(worldView ? places.filter(p => visitedIds.has(p.city)) : places, region, size), [places, region, size, worldView, visitedIds]);
  const labels = React.useMemo(() => variant === 'overview' ? [] : resolveGlobalMapLabels(places, region, size,
    stats.filter(s => s.isVisited).map(s => s.city), new Set(clusters.filter(c => c.cities.length === 1).map(c => c.cities[0])),
    clusters.map(c => {
      const radius = (c.cities.length > 1 ? travelMapTheme.clusterSize : travelMapTheme.markerSize) / 2;
      return { x: size.width / 2 + wrapLongitude(c.longitude - region.longitude) / region.longitudeDelta * size.width - radius,
        y: size.height / 2 - (c.latitude - region.latitude) / region.latitudeDelta * size.height - radius, width: radius * 2, height: radius * 2 };
    })), [places, region, size, stats, clusters, variant]);
  const counts = new Map(stats.map(s => [s.city, s.visitCount]));
  const finishCamera = React.useCallback((next: GlobalRegion, nextScale: number, generation: number, reached?: () => void) => {
    if (pendingCamera.current?.generation !== generation) return;
    pendingCamera.current = null;
    const w = Math.min(width.value, height.value * 2);
    const viewport = { ...next, longitudeDelta: 360 / nextScale, latitudeDelta: 360 / nextScale * height.value / Math.max(1, w) };
    setRegion(viewport);
    onViewportChange?.(viewport);
    reached?.();
  }, [width, height, onViewportChange]);
  const applyRegion = React.useCallback((next: GlobalRegion, reached?: () => void) => {
    const generation = ++cameraGeneration.current;
    pendingCamera.current = { region: next, reached, generation };
    const w = Math.min(width.value, height.value * 2);
    const viewportLatitudeSpan = 360 * height.value / Math.max(1, w);
    const nextScale = Math.min(65536, Math.max(1, Math.min(360 / Math.max(next.longitudeDelta, 0.001), viewportLatitudeSpan / Math.max(next.latitudeDelta, 0.001))));
    x.value = withTiming(-next.longitude / 360 * w * nextScale, { duration: 350 });
    y.value = withTiming(next.latitude / 180 * w / 2 * nextScale, { duration: 350 });
    scale.value = withTiming(nextScale, { duration: 350 });
    // Panning between cities can keep the same scale. Its completion callback would
    // fire immediately, before x/y arrive, so use a dedicated animation clock.
    cameraProgress.value = 0;
    cameraProgress.value = withTiming(1, { duration: 350 }, finished => { if (finished) runOnJS(finishCamera)(next, nextScale, generation, reached); });
    setRegion({ ...next, longitudeDelta: 360 / nextScale, latitudeDelta: 360 / nextScale * height.value / Math.max(1, w) });
  }, [width, height, scale, x, y, cameraProgress, finishCamera]);
  React.useEffect(() => {
    if (!applied.current || fittedSaved.current || userMoved.current || !stats.some(s => s.isVisited)) return;
    fittedSaved.current = true;
    applyRegion(getInitialGlobalRegion(stats));
  }, [stats, applyRegion]);
  React.useEffect(() => {
    if (!targetCity) return;
    const entry = resolveCityEntry(targetCity);
    if (entry) { markInteraction(); applyRegion({ ...entry.geographic, latitudeDelta: 0.08, longitudeDelta: 0.08 }, onTargetReached); }
  }, [targetCity, applyRegion, onTargetReached, markInteraction]);
  const settle = React.useCallback((nextScale: number, nextX: number, nextY: number) => {
    const w = Math.min(width.value, height.value * 2);
    const viewport = { longitude: -nextX / Math.max(1, w * nextScale) * 360, latitude: nextY / Math.max(1, w / 2 * nextScale) * 180,
      longitudeDelta: 360 / nextScale, latitudeDelta: 360 / nextScale * height.value / Math.max(1, w) };
    setRegion(viewport); onViewportChange?.(viewport);
  }, [width, height, onViewportChange]);
  const pan = Gesture.Pan().enabled(variant === 'workspace').maxPointers(1)
    .onBegin(() => { runOnJS(markInteraction)(); startX.value = x.value; startY.value = y.value; })
    .onUpdate(event => {
      const w = Math.min(width.value, height.value * 2);
      const limit = w * scale.value / 2;
      const rawX = startX.value + event.translationX;
      x.value = ((rawX + limit) % (2 * limit) + 2 * limit) % (2 * limit) - limit;
      y.value = Math.min(w / 4 * scale.value, Math.max(-w / 4 * scale.value, startY.value + event.translationY));
    }).onFinalize(() => { runOnJS(settle)(scale.value, x.value, y.value); });
  const pinch = Gesture.Pinch().enabled(variant === 'workspace')
    .onBegin(event => { runOnJS(markInteraction)(); startScale.value = scale.value; startX.value = x.value; startY.value = y.value; focalX.value = event.focalX; focalY.value = event.focalY; })
    .onUpdate(event => {
      const nextScale = Math.min(65536, Math.max(1, startScale.value * event.scale));
      const ratio = nextScale / startScale.value;
      const next = clampGlobalViewport({ scale: nextScale,
        x: event.focalX - width.value / 2 - (focalX.value - width.value / 2 - startX.value) * ratio,
        y: event.focalY - height.value / 2 - (focalY.value - height.value / 2 - startY.value) * ratio }, { width: width.value, height: height.value });
      x.value = next.x; y.value = next.y; scale.value = next.scale;
    }).onFinalize(() => { runOnJS(settle)(scale.value, x.value, y.value); });
  const doubleTap = Gesture.Tap().enabled(variant === 'workspace').numberOfTaps(2).maxDistance(10).maxDelay(280)
    .onEnd((event, success) => {
      if (!success) return;
      runOnJS(markInteraction)();
      const nextScale = scale.value >= 65536 ? 1 : Math.min(65536, scale.value * 2);
      const ratio = nextScale / scale.value;
      const next = clampGlobalViewport({ scale: nextScale,
        x: event.x - width.value / 2 - (event.x - width.value / 2 - x.value) * ratio,
        y: event.y - height.value / 2 - (event.y - height.value / 2 - y.value) * ratio }, { width: width.value, height: height.value });
      const nextX = next.x; const nextY = next.y;
      x.value = withTiming(nextX, { duration: 200 });
      y.value = withTiming(nextY, { duration: 200 });
      scale.value = withTiming(nextScale, { duration: 200 }, finished => { if (finished) runOnJS(settle)(nextScale, nextX, nextY); });
    });
  const canvasStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  const select = (cluster: GlobalCluster) => {
    markInteraction();
    if (cluster.cities.length === 1) { if (interactive) onCityPress?.(cluster.cities[0]); return; }
    const points = places.filter(p => cluster.cities.includes(p.city));
    if (hasCoincidentCoordinates(points) || region.longitudeDelta <= 0.006) { setChoices(cluster.cities); return; }
    const next = fitGlobalRegion(points);
    applyRegion({ ...next, latitudeDelta: Math.min(next.latitudeDelta, region.latitudeDelta / 2), longitudeDelta: Math.min(next.longitudeDelta, region.longitudeDelta / 2) });
  };
  return <View style={variant === 'overview' ? styles.overviewFrame : styles.workspaceFrame}>
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, doubleTap)}>
      <View accessibilityLabel="离线全球城市旅行地图" style={variant === 'overview' ? styles.overview : styles.workspace} testID={`global-map-${variant}`} onLayout={event => {
        const next = event.nativeEvent.layout;
        if (next.width <= 0 || next.height <= 0) return;
        if (applied.current && next.width === width.value && next.height === height.value) return;
        const oldW = Math.min(width.value, height.value * 2); const nextW = Math.min(next.width, next.height * 2);
        width.value = next.width; height.value = next.height;
        setSize({ width: next.width, height: next.height });
        if (!applied.current) { applied.current = true; applyRegion(initial); }
        else if (pendingCamera.current) applyRegion(pendingCamera.current.region, pendingCamera.current.reached);
        else { if (nextW !== oldW) { x.value *= nextW / oldW; y.value *= nextW / oldW; } settle(scale.value, x.value, y.value); }
      }}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, canvasStyle]} testID="global-map-canvas">
          <Svg width="100%" height="100%" viewBox={worldMapViewBox} style={{ overflow: 'visible' }} preserveAspectRatio="xMidYMid meet" testID="global-map-content">
            {[-1, 0, 1].map(copy => <G key={copy} transform={`translate(${copy * 3600}, 0)`}>
              {worldLandPaths.map((path, i) => <Path key={i} d={path} fill={travelMapTheme.land} stroke={travelMapTheme.boundary} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)}
              {worldCountryData.map(country => <Path key={country.id} d={country.path} fill={travelMapTheme.land} stroke={travelMapTheme.boundary} strokeWidth={0.5} vectorEffect="non-scaling-stroke" testID={copy === 0 ? `global-country-${country.id}` : undefined} />)}
            </G>)}
          </Svg>
        </Animated.View>
        <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs><Pattern id="travel-paper-grain" width={31} height={29} patternUnits="userSpaceOnUse">
            <Circle cx={4} cy={7} r={0.6} fill={colors.ink} opacity={0.035} />
            <Circle cx={21} cy={19} r={0.45} fill={colors.ink} opacity={0.025} />
            <Path d="M8 23h2 M27 5h1" stroke={colors.surface} strokeOpacity={0.14} strokeWidth={0.7} />
          </Pattern></Defs>
          <Rect width="100%" height="100%" fill="url(#travel-paper-grain)" />
        </Svg>
        {labels.map(label => <PaperMapLabel key={label.id} label={label} scale={scale} x={x} y={y} width={width} height={height} />)}
        {clusters.map(cluster => <ClusterDot key={cluster.id} cluster={cluster} scale={scale} x={x} y={y} width={width} height={height} count={cluster.cities.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0)} onPress={() => select(cluster)} />)}
        {variant === 'workspace' && worldView && visitedIds.size === 0 ? <Text pointerEvents="none" style={styles.worldHint}>放大地图，探索下一座城市</Text> : null}
        {variant === 'workspace' ? <View style={styles.zoomControls}>
          <Pressable accessibilityLabel="放大全球地图" onPress={() => { markInteraction(); applyRegion({ ...region, longitudeDelta: region.longitudeDelta / 2, latitudeDelta: region.latitudeDelta / 2 }); }} style={styles.control}><Text>＋</Text></Pressable>
          <Pressable accessibilityLabel="缩小全球地图" onPress={() => { markInteraction(); applyRegion({ ...region, longitudeDelta: Math.min(360, region.longitudeDelta * 2), latitudeDelta: Math.min(180, region.latitudeDelta * 2) }); }} style={styles.control}><Text>−</Text></Pressable>
          <Pressable accessibilityLabel="查看全球" onPress={() => { markInteraction(); applyRegion(fitGlobalRegion([])); }} style={styles.control}><Text>◎</Text></Pressable>
        </View> : null}
        {onMapPress ? <Pressable accessibilityRole="button" accessibilityLabel="全屏查看全球地图" onPress={onMapPress} style={styles.fullscreen}><Text style={styles.buttonText}>全屏查看</Text></Pressable> : null}
        {choices.length ? <GlobalPlaceChoices cities={choices} onClose={() => setChoices([])} onSelect={city => { setChoices([]); if (interactive) onCityPress?.(city); }} /> : null}
      </View>
    </GestureDetector>
    <Text style={styles.attribution}>World map · Natural Earth · Public domain</Text>
  </View>;
}

const styles = StyleSheet.create({
  workspaceFrame: { flex: 1, minHeight: 0 }, overviewFrame: { width: '100%' },
  overview: { aspectRatio: 2, width: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: travelMapTheme.sea },
  workspace: { flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.accentSoft },
  markerTarget: { position: 'absolute', width: 44, height: 44 }, markerPress: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1.5 },
  cluster: { width: travelMapTheme.clusterSize, height: travelMapTheme.clusterSize, borderRadius: travelMapTheme.clusterSize / 2, alignItems: 'center', justifyContent: 'center' }, count: { fontSize: 10, fontWeight: '700', fontFamily: travelMapTheme.labelFont, color: colors.ink },
  label: { position: 'absolute', height: 24, alignItems: 'center', justifyContent: 'center' },
  labelText: { fontSize: 11, color: colors.ink, backgroundColor: travelMapTheme.labelPaper, borderRadius: 3, paddingHorizontal: 3, overflow: 'hidden', fontFamily: travelMapTheme.labelFont },
  cityLabel: { fontSize: 13, fontWeight: '700' },
  worldHint: { position: 'absolute', left: 20, right: 68, bottom: 20, color: colors.muted, fontSize: 12, fontFamily: travelMapTheme.labelFont },
  zoomControls: { position: 'absolute', right: 12, bottom: 12, gap: 4 }, control: { width: 44, height: 44, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  fullscreen: { position: 'absolute', right: 12, top: 12, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 16, backgroundColor: colors.surface },
  buttonText: { color: colors.accent, fontWeight: '800' }, attribution: { alignSelf: 'flex-end', color: colors.muted, fontSize: 9, paddingTop: 4 },
});
