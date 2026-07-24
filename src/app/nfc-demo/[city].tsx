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
        <Text selectable style={{ color: colors.ink, fontWeight: "700" }}>城市钥匙</Text>
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          已读取该城市的记忆钥匙，可查看对应的城市收藏。
        </Text>
      </View>
      <AppButton label="查看城市收藏" tone="secondary" onPress={() => router.replace({ pathname: "/city/[city]", params: { city: result.city } })} />
    </ScrollView>
  );
}

