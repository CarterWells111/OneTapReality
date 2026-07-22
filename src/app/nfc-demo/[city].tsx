import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { AppButton, colors } from "../../components/ui";
import { CityKeyResolver } from "../../services/nfc/city-key-resolver";
import { cities, type City } from "../../types/memory";

function asCity(value: string): City {
  return cities.includes(value as City) ? (value as City) : "hangzhou";
}

export default function NfcDemoScreen() {
  const router = useRouter();
  const { city: rawCity } = useLocalSearchParams<{ city: string }>();
  const result = new CityKeyResolver().resolve(asCity(rawCity));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <View style={{ backgroundColor: colors.accentSoft, borderRadius: 22, gap: 12, padding: 22 }}>
        <Text selectable style={{ color: colors.ink, fontSize: 24, fontWeight: "800" }}>{result.title}</Text>
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{result.message}</Text>
      </View>
      <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 10, padding: 18 }}>
        <Text selectable style={{ color: colors.ink, fontWeight: "700" }}>Expo Go 模拟模式</Text>
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          当前按钮模拟读取城市钥匙。Expo Go 不支持真实第三方 NFC 扫描；下一阶段会使用 Development Build 和 NTAG213 标签。
        </Text>
      </View>
      <AppButton label="查看城市收藏" tone="secondary" onPress={() => router.replace({ pathname: "/city/[city]", params: { city: result.city } })} />
    </ScrollView>
  );
}

