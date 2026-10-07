import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../components/ui';
import { getCityContent } from './city-content';

export function GlobalPlaceChoices({ cities, onSelect, onClose }: { cities: readonly string[]; onSelect: (city: string) => void; onClose: () => void }) {
  return <View style={styles.panel}>
    <Text style={styles.title}>选择地点</Text>
    <ScrollView>
      {cities.map(city => <Pressable key={city} accessibilityRole="button" accessibilityLabel={`${getCityContent(city).name}，查看旅行记忆`} onPress={() => onSelect(city)} style={styles.row}><Text style={styles.text}>{getCityContent(city).name}</Text></Pressable>)}
    </ScrollView>
    <Pressable accessibilityRole="button" accessibilityLabel="关闭地点列表" onPress={onClose} style={styles.row}><Text style={styles.text}>关闭</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ panel: { position: 'absolute', bottom: 16, left: 12, right: 12, maxHeight: 260, padding: 12, backgroundColor: colors.surface, borderRadius: 16, borderColor: colors.line, borderWidth: 1 },
  title: { color: colors.ink, fontWeight: '700', padding: 8 }, row: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, text: { color: colors.ink } });
