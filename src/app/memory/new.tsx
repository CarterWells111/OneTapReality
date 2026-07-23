import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { resolveCityRouteParam } from "../../features/cities/city-route";
import { useMemories } from "../../features/memories/memories-provider";
import { cityRegistry, type City, type CityKind } from "../../types/city";

const cityGroupLabels: Record<CityKind, string> = {
  "autonomous-region-capital": "自治区首府",
  "legacy-city": "既有城市",
  municipality: "直辖市",
  "province-capital": "省会",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewMemoryScreen() {
  const router = useRouter();
  const { city: rawCity } = useLocalSearchParams<{ city?: string }>();
  const { createDraft } = useMemories();
  const [title, setTitle] = React.useState("我们的旅行");
  const presetCity = resolveCityRouteParam(rawCity);
  const [city, setCity] = React.useState<City>(presetCity);
  const [cityQuery, setCityQuery] = React.useState("");
  const [travelDate, setTravelDate] = React.useState(today);
  const [photoUris, setPhotoUris] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setCity(presetCity);
  }, [presetCity]);

  const visibleCityGroups = React.useMemo(() => {
    const normalizedQuery = cityQuery.trim().toLocaleLowerCase();
    return (Object.keys(cityGroupLabels) as CityKind[]).map((kind) => ({
      kind,
      cities: cityRegistry.filter((entry) => entry.kind === kind && (!normalizedQuery || [entry.id, entry.name, entry.region].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))),
    })).filter((group) => group.cities.length > 0);
  }, [cityQuery]);

  const selectPhotos = async () => {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("未获得照片权限。你可以在系统设置中允许访问后再选择照片。");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotoUris(result.assets.map((asset) => asset.uri));
      void Haptics.selectionAsync();
    }
  };

  const generate = async () => {
    setError("");
    setIsSaving(true);
    try {
      const memory = await createDraft({ title, city, travelDate, photoUris });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/memory/review/[id]", params: { id: memory.id } });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法创建旅行册，请重试。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 22, padding: 20 }}>
      <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
        你选择的照片只在这台设备上使用。本版会生成固定的本地旅行册草稿，之后可随时修改。
      </Text>
      <Section title="旅行信息">
        <TextInput
          accessibilityLabel="纪念册标题"
          onChangeText={setTitle}
          placeholder="纪念册标题"
          style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 16, minHeight: 50, paddingHorizontal: 14 }}
          value={title}
        />
        <TextInput
          accessibilityLabel="旅行日期"
          onChangeText={setTravelDate}
          placeholder="YYYY-MM-DD"
          style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 16, minHeight: 50, paddingHorizontal: 14 }}
          value={travelDate}
        />
        <Text accessibilityLabel={`已选城市 ${cityContent[city].name}`} selectable style={{ color: colors.accent, fontWeight: "800" }}>已选：{cityContent[city].name}</Text>
        <TextInput
          accessibilityLabel="搜索城市"
          onChangeText={setCityQuery}
          placeholder="搜索城市或省份"
          style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 16, minHeight: 50, paddingHorizontal: 14 }}
          value={cityQuery}
        />
        <View style={{ gap: 14 }}>
          {visibleCityGroups.map((group) => (
            <View key={group.kind} style={{ gap: 8 }}>
              <Text selectable style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{cityGroupLabels[group.kind]}</Text>
              {group.cities.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityLabel={`${item.name} · ${item.region}`}
                  accessibilityRole="button"
                  onPress={() => setCity(item.id)}
                  style={({ pressed }) => ({ backgroundColor: city === item.id ? colors.accent : colors.surface, borderColor: city === item.id ? colors.accent : colors.line, borderRadius: 14, borderWidth: 1, minHeight: 48, opacity: pressed ? 0.82 : 1, paddingHorizontal: 14, paddingVertical: 12 })}
                >
                  <Text selectable style={{ color: city === item.id ? "#FFFFFF" : colors.ink, fontWeight: "700" }}>{item.name} · {item.region}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </Section>
      <Section title="选择照片">
        <AppButton label={photoUris.length ? `已选 ${photoUris.length} 张，重新选择` : "从相册选择照片"} tone="secondary" onPress={() => void selectPhotos()} />
        {photoUris.length > 0 ? (
          <ScrollView horizontal contentContainerStyle={{ gap: 10 }} showsHorizontalScrollIndicator={false}>
            {photoUris.map((uri) => (
              <Image key={uri} source={{ uri }} style={{ borderRadius: 12, height: 92, width: 92 }} />
            ))}
          </ScrollView>
        ) : null}
      </Section>
      {error ? <Text selectable style={{ color: colors.danger, lineHeight: 21 }}>{error}</Text> : null}
      <AppButton label={isSaving ? "正在生成旅行册…" : "生成旅行册草稿"} disabled={isSaving} onPress={() => void generate()} />
    </ScrollView>
  );
}

