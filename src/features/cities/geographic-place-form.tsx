import * as React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AppButton, colors } from '../../components/ui';
import { createGeographicCity } from '../../types/city';

export function GeographicPlaceForm({ onSelect }: { onSelect: (city: string) => void }) {
  const [name, setName] = React.useState('');
  const [latitude, setLatitude] = React.useState('');
  const [longitude, setLongitude] = React.useState('');
  const [error, setError] = React.useState('');
  const select = () => {
    try {
      if (!latitude.trim() || !longitude.trim()) throw new Error('Missing coordinates');
      const city = createGeographicCity({ name, latitude: Number(latitude.trim()), longitude: Number(longitude.trim()) });
      setError(''); onSelect(city);
    } catch { setError('请填写地点名称，以及 −90～90 的纬度、−180～180 的经度。'); }
  };
  return <View style={styles.form}>
    <Text style={styles.title}>找不到目的地？添加自己的地点</Text>
    <TextInput accessibilityLabel="地点名称" placeholder="地点名称" value={name} onChangeText={setName} maxLength={100} style={styles.input} />
    <View style={styles.row}>
      <TextInput accessibilityLabel="纬度" placeholder="纬度（可为负数）" value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" style={[styles.input, styles.coordinate]} />
      <TextInput accessibilityLabel="经度" placeholder="经度（可为负数）" value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" style={[styles.input, styles.coordinate]} />
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <AppButton label="使用这个地点" onPress={select} />
  </View>;
}
const styles = StyleSheet.create({ form: { gap: 10, paddingVertical: 12 }, title: { color: colors.ink, fontWeight: '700' },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, color: colors.ink },
  row: { flexDirection: 'row', gap: 8 }, coordinate: { flex: 1 }, error: { color: colors.ink, fontSize: 13 } });
