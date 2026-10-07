import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../components/ui';
import type { CityMapProps } from './city-map';
import type { GlobalRegion } from './global-map-domain';
import { travelMapTheme } from './global-map-style';
import { GlobalPaperMap } from './global-paper-map';
import { StreetCityMap } from './global-street-map.ios';

/** The default travel canvas follows the original domestic map. */
export function GlobalCityMap(props: CityMapProps) {
  const { onViewportChange } = props;
  const [mode, setMode] = React.useState<'paper' | 'street'>('paper');
  const lastRegion = React.useRef<GlobalRegion | undefined>(props.initialRegion);
  const [startingRegion, setStartingRegion] = React.useState(props.initialRegion);
  const rememberRegion = React.useCallback((region: GlobalRegion) => {
    lastRegion.current = region;
    onViewportChange?.(region);
  }, [onViewportChange]);
  if (props.variant === 'overview') return <GlobalPaperMap {...props} />;
  return <View style={styles.frame}>
    <View style={styles.modes}>
      {(['paper', 'street'] as const).map(next => <Pressable key={next}
        accessibilityRole="button" accessibilityLabel={next === 'paper' ? '旅行地图' : '街道地图'}
        accessibilityState={{ selected: mode === next }}
        onPress={() => { if (next !== mode) { setStartingRegion(lastRegion.current); setMode(next); } }}
        style={[styles.mode, mode === next && styles.selected]}>
        <Text style={[styles.text, mode === next && styles.selectedText]}>{next === 'paper' ? '旅行地图' : '街道地图'}</Text>
      </Pressable>)}
    </View>
    {mode === 'paper' ? <GlobalPaperMap {...props} initialRegion={startingRegion} onViewportChange={rememberRegion} />
      : <StreetCityMap {...props} initialRegion={startingRegion} onViewportChange={rememberRegion} />}
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  modes: { flexDirection: 'row', alignSelf: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, marginBottom: 8, padding: 3 },
  mode: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 12 },
  selected: { backgroundColor: colors.accentSoft },
  text: { color: colors.muted, fontFamily: travelMapTheme.labelFont, fontSize: 13 },
  selectedText: { color: colors.accent },
});
