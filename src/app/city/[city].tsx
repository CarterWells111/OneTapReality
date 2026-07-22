import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { cities, type City } from "../../types/memory";

function asCity(value: string): City {
  return cities.includes(value as City) ? (value as City) : "hangzhou";
}

export default function CityScreen() {
  const router = useRouter();
  const { city: rawCity } = useLocalSearchParams<{ city: string }>();
  const city = asCity(rawCity);
  const item = cityContent[city];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, padding: 20 }}>
      <View style={{ backgroundColor: item.color, borderRadius: 24, gap: 10, padding: 22 }}>
        <Text selectable style={{ color: colors.ink, fontSize: 30, fontWeight: "800" }}>{item.name}</Text>
        <Text selectable style={{ color: colors.muted, fontSize: 16, lineHeight: 23 }}>{item.subtitle}</Text>
      </View>
      <Section title="城市纪念钥匙">
        <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 10, padding: 18 }}>
          <Text selectable style={{ color: colors.ink, fontSize: 18, fontWeight: "800" }}>{item.souvenir}</Text>
          <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
            这是可嵌入 NFC 芯片的 3D 打印概念件。正式版可通过碰一碰打开对应旅行册和限定实体相册设计。
          </Text>
        </View>
      </Section>
      <Section title="实体旅行册概念">
        <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
          现场演示仅收集体验反馈，不包含支付或下单。未来可提供字体、贴画、版式和城市合作材料。
        </Text>
      </Section>
      <AppButton label="模拟碰一碰" onPress={() => router.push({ pathname: "/nfc-demo/[city]", params: { city } })} />
    </ScrollView>
  );
}

