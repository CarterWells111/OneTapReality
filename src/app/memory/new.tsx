import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as React from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { AppButton, colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { useMemories } from "../../features/memories/memories-provider";
import { cities, type City } from "../../types/memory";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewMemoryScreen() {
  const router = useRouter();
  const { createMemory } = useMemories();
  const [title, setTitle] = React.useState("我们的旅行");
  const [city, setCity] = React.useState<City>("hangzhou");
  const [travelDate, setTravelDate] = React.useState(today);
  const [photoUris, setPhotoUris] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

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
      const memory = await createMemory({ title, city, travelDate, photoUris });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/memory/[id]", params: { id: memory.id } });
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
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {cities.map((item) => (
            <Pressable
              key={item}
              onPress={() => setCity(item)}
              style={{ backgroundColor: city === item ? colors.accent : colors.surface, borderColor: colors.line, borderRadius: 99, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 }}
            >
              <Text selectable style={{ color: city === item ? "#FFFFFF" : colors.ink, fontWeight: "700" }}>
                {cityContent[item].name}
              </Text>
            </Pressable>
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

