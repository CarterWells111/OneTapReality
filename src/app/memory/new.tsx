import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  const [activeSheet, setActiveSheet] = React.useState<"date" | "city" | null>(null);

  const initialDate = new Date(travelDate);
  const [draftYear, setDraftYear] = React.useState(initialDate.getFullYear());
  const [draftMonth, setDraftMonth] = React.useState(initialDate.getMonth() + 1);
  const [draftDay, setDraftDay] = React.useState(initialDate.getDate());

  React.useEffect(() => {
    setCity(presetCity);
  }, [presetCity]);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const dayCount = daysInMonth(draftYear, draftMonth);

  const visibleCityGroups = React.useMemo(() => {
    const normalizedQuery = cityQuery.trim().toLocaleLowerCase();
    return (Object.keys(cityGroupLabels) as CityKind[]).map((kind) => ({
      kind,
      cities: cityRegistry.filter((entry) => entry.kind === kind && (!normalizedQuery || [entry.id, entry.name, entry.region].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))),
    })).filter((group) => group.cities.length > 0);
  }, [cityQuery]);

  const confirmDate = () => {
    const clampedDay = Math.min(draftDay, dayCount);
    setTravelDate(formatDate(draftYear, draftMonth, clampedDay));
    setActiveSheet(null);
  };

  const pickCity = (nextCity: City) => {
    setCity(nextCity);
    setCityQuery("");
    setActiveSheet(null);
    void Haptics.selectionAsync();
  };

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
    <View style={styles.root}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text selectable style={styles.helper}>
        你选择的照片只在这台设备上使用。本版会生成固定的本地旅行册草稿，之后可随时修改。
      </Text>

      <Section title="旅行信息">
        <View style={styles.formCard}>
          <View style={[styles.formRow, styles.formRowDivider]}>
            <Text selectable style={styles.formLabel}>名称</Text>
            <TextInput
              accessibilityLabel="纪念册标题"
              onChangeText={setTitle}
              placeholder="纪念册标题"
              placeholderTextColor={colors.muted}
              style={styles.formInput}
              value={title}
            />
          </View>
          <Pressable
            accessibilityLabel="选择旅行日期"
            accessibilityRole="button"
            onPress={() => setActiveSheet("date")}
            style={({ pressed }) => [styles.formRow, styles.formRowDivider, pressed && styles.pressed]}
          >
            <Text selectable style={styles.formLabel}>日期</Text>
            <Text selectable style={styles.formValue}>{travelDate} ›</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="选择地点"
            accessibilityRole="button"
            onPress={() => setActiveSheet("city")}
            style={({ pressed }) => [styles.formRow, pressed && styles.pressed]}
          >
            <Text selectable style={styles.formLabel}>地点</Text>
            <Text
              accessibilityLabel={`已选城市 ${cityContent[city].name}`}
              selectable
              style={styles.formValue}
            >
              {cityContent[city].name} ›
            </Text>
          </Pressable>
        </View>
      </Section>

      <Section title="选择照片">
        <AppButton label={photoUris.length ? `已选 ${photoUris.length} 张，重新选择` : "从相册选择照片"} tone="secondary" onPress={() => void selectPhotos()} />
        {photoUris.length > 0 ? (
          <ScrollView horizontal contentContainerStyle={styles.photoStrip} showsHorizontalScrollIndicator={false}>
            {photoUris.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.photoPreview} />
            ))}
          </ScrollView>
        ) : null}
      </Section>

      {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}
      {photoUris.length > 0 ? (
        <AppButton label={isSaving ? "正在生成旅行册…" : "生成旅行册草稿"} disabled={isSaving} onPress={() => void generate()} />
      ) : (
        <Text selectable style={styles.footNote}>选好照片后，这里会出现「生成旅行册草稿」。</Text>
      )}
      </ScrollView>

      {activeSheet === "date" ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text selectable style={styles.sheetTitle}>选择旅行日期</Text>
            <Text selectable style={styles.sheetGroupLabel}>年份</Text>
            <View style={styles.chipRow}>
              {yearOptions.map((year) => (
                <SheetChip key={year} label={`${year}`} selected={draftYear === year} onPress={() => setDraftYear(year)} />
              ))}
            </View>
            <Text selectable style={styles.sheetGroupLabel}>月份</Text>
            <View style={styles.chipRow}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <SheetChip key={month} label={`${month} 月`} selected={draftMonth === month} onPress={() => setDraftMonth(month)} />
              ))}
            </View>
            <Text selectable style={styles.sheetGroupLabel}>日期</Text>
            <View style={styles.chipRow}>
              {Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => (
                <SheetChip key={day} label={`${day}`} selected={Math.min(draftDay, dayCount) === day} onPress={() => setDraftDay(day)} />
              ))}
            </View>
            <AppButton label="确认日期" onPress={confirmDate} />
            <AppButton label="取消" tone="secondary" onPress={() => setActiveSheet(null)} />
          </View>
        </View>
      ) : null}

      {activeSheet === "city" ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text selectable style={styles.sheetTitle}>选择地点</Text>
            <TextInput
              accessibilityLabel="搜索城市"
              onChangeText={setCityQuery}
              placeholder="搜索城市或省份"
              placeholderTextColor={colors.muted}
              style={styles.sheetInput}
              value={cityQuery}
            />
            <ScrollView contentContainerStyle={styles.cityList}>
              {visibleCityGroups.map((group) => (
                <View key={group.kind} style={styles.cityGroup}>
                  <Text selectable style={styles.sheetGroupLabel}>{cityGroupLabels[group.kind]}</Text>
                  {group.cities.map((item) => (
                    <Pressable
                      accessibilityLabel={`${item.name} · ${item.region}`}
                      accessibilityRole="button"
                      key={item.id}
                      onPress={() => pickCity(item.id)}
                      style={({ pressed }) => [
                        styles.cityOption,
                        city === item.id && styles.cityOptionSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text selectable style={[styles.cityOptionText, city === item.id && styles.cityOptionTextSelected]}>
                        {item.name} · {item.region}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
            <AppButton label="取消" tone="secondary" onPress={() => setActiveSheet(null)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SheetChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      <Text selectable style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 22, padding: 20, paddingBottom: 40 },
  helper: { color: colors.muted, lineHeight: 22 },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  formRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 54,
  },
  formRowDivider: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  formLabel: { color: colors.ink, fontSize: 15.5, fontWeight: "700" },
  formInput: { color: colors.ink, flex: 1, fontSize: 15.5, textAlign: "right" },
  formValue: { color: colors.accent, fontSize: 15.5, fontWeight: "700" },
  photoStrip: { gap: 10 },
  photoPreview: { borderRadius: 12, height: 92, width: 92 },
  errorText: { color: colors.danger, lineHeight: 21 },
  footNote: { color: colors.muted, fontSize: 13, textAlign: "center" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(38, 49, 62, 0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 12,
    maxHeight: "82%",
    padding: 20,
  },
  sheetTitle: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  sheetGroupLabel: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  sheetInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  chipLabelSelected: { color: "#FFFFFF" },
  cityList: { gap: 14, paddingBottom: 10 },
  cityGroup: { gap: 8 },
  cityOption: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  cityOptionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  cityOptionText: { color: colors.ink, fontWeight: "700" },
  cityOptionTextSelected: { color: "#FFFFFF" },
  pressed: { opacity: 0.82 },
});
