import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, colors, PaperCard, Section, serifFont, Tag } from "../../components/ui";
import { ColorPicker } from "../../components/ColorPicker";
import { cityContent } from "../../features/cities/city-content";
import { resolveCityRouteParam } from "../../features/cities/city-route";
import { createBalancedPhotoPagePlans } from "../../features/memories/photo-page-planner";
import { DraftPhotoAllocation } from "../../features/memories/draft-photo-allocation";
import { useMemories } from "../../features/memories/memories-provider";
import {
  MIN_TRAVEL_DATE,
  parseIsoTravelDate,
  toIsoTravelDate,
} from "../../features/memories/travel-date";
import { cityRegistry, type City, type CityKind } from "../../types/city";
import type { MemoryDraftPagePlan } from "../../types/memory";

const cityGroupLabels: Record<CityKind, string> = {
  "autonomous-region-capital": "自治区首府",
  "legacy-city": "既有城市",
  municipality: "直辖市",
  "province-capital": "省会",
};

/** 封面预设颜色（十六进制）。 */
const COVER_COLORS = [
  "#EFE2CF",
  "#F6D8C7",
  "#E9C4A3",
  "#D9E3D0",
  "#BFD8E2",
  "#E7D2E6",
  "#D8CFC4",
  "#C7B79C",
] as const;

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
  const [coverColor, setCoverColor] = React.useState<string>(COVER_COLORS[0]);
  const [coverImage, setCoverImage] = React.useState<string | undefined>(undefined);
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const [photoUris, setPhotoUris] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeSheet, setActiveSheet] = React.useState<"city" | null>(null);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [pagePlans, setPagePlans] = React.useState<MemoryDraftPagePlan[]>([]);

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

  const openDatePicker = () => setShowDatePicker(true);

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
    if (event.type === "set" && selected) {
      setTravelDate(toIsoTravelDate(selected));
    }
  };

  const pickCity = (nextCity: City) => {
    setCity(nextCity);
    setCityQuery("");
    setActiveSheet(null);
    void Haptics.selectionAsync();
  };

  const selectPhotos = async () => {
    setError("");
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled) {
      const nextPhotoUris = result.assets.map((asset) => asset.uri);
      setPhotoUris(nextPhotoUris);
      try {
        setPagePlans(createBalancedPhotoPagePlans(nextPhotoUris));
      } catch (caughtError) {
        setPagePlans([]);
        setError(caughtError instanceof Error ? caughtError.message : "无法安排照片，请重试。");
      }
      void Haptics.selectionAsync();
    }
  };

  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverImage(result.assets[0].uri);
      void Haptics.selectionAsync();
    }
  };

  const generate = async () => {
    if (!canGenerate) return;
    setError("");
    setIsSaving(true);
    try {
      const memory = await createDraft({ title, city, travelDate, photoUris, pagePlans, coverColor, coverImage });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/memory/review/[id]", params: { id: memory.id } });
    } catch {
      setError("无法创建旅行册，请检查所选照片后重试。");
    } finally {
      setIsSaving(false);
    }
  };

  const canGenerate = photoUris.length > 0
    && pagePlans.length > 0
    && pagePlans.every((plan) => plan.photoUris.length > 0)
    && pagePlans.reduce((counts, plan) => {
      for (const uri of plan.photoUris) counts.set(uri, (counts.get(uri) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()).size === photoUris.length
    && photoUris.every((uri) => pagePlans.reduce((count, plan) => count + plan.photoUris.filter((candidate) => candidate === uri).length, 0) === 1);

  return (
    <View style={styles.root}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <PaperCard tone="paper" style={styles.intro}>
        <Tag label="开始新的一册" />
        <Text selectable style={styles.introText}>
          翻开一页空白的旅行册。选择照片后即可生成草稿，之后可随时修改。
        </Text>
      </PaperCard>

      <Section title="旅行信息" caption="TRIP INFO">
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
            onPress={openDatePicker}
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

      {/* ── 封面 ── */}
      <Section title="封面" caption="COVER">
        <View style={styles.coverPreviewRow}>
          <View style={[styles.coverPreview, !coverImage && { backgroundColor: coverColor }]}>
            {coverImage ? (
              <Image source={{ uri: coverImage }} style={styles.coverPreviewImage} />
            ) : null}
          </View>
          <View style={styles.coverHintCol}>
            <Text selectable style={styles.coverHint}>点选颜色或上传一张封面图。</Text>
            {coverImage ? (
              <Pressable onPress={() => setCoverImage(undefined)} style={styles.coverClearLink}>
                <Text style={styles.coverClearText}>移除封面图</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={styles.swatchGrid}>
          {COVER_COLORS.map((swatch) => (
            <Pressable
              accessibilityLabel={`封面颜色 ${swatch}`}
              accessibilityRole="button"
              accessibilityState={{ selected: coverColor === swatch && !coverImage }}
              key={swatch}
              onPress={() => {
                setCoverColor(swatch);
                setCoverImage(undefined);
                void Haptics.selectionAsync();
              }}
              style={[styles.swatch, { backgroundColor: swatch }, coverColor === swatch && !coverImage && styles.swatchSelected]}
            />
          ))}
          {/* 色盘图标 */}
          <Pressable
            accessibilityLabel="自定封面颜色"
            accessibilityRole="button"
            onPress={() => setShowColorPicker(true)}
            style={[styles.swatch, styles.toolSwatch]}
          >
            <Text selectable style={styles.toolSwatchText}>🎨</Text>
          </Pressable>
          {/* 上传封面图 */}
          <Pressable
            accessibilityLabel="上传封面图片"
            accessibilityRole="button"
            onPress={() => void pickCoverImage()}
            style={[styles.swatch, styles.toolSwatch]}
          >
            <Text selectable style={styles.toolSwatchText}>🖼</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="选择照片" caption="PHOTOS">
        <AppButton label={photoUris.length ? `已选 ${photoUris.length} 张，重新选择` : "从相册选择照片"} tone="secondary" onPress={() => void selectPhotos()} />
        {photoUris.length > 0 ? (
          <ScrollView horizontal contentContainerStyle={styles.photoStrip} showsHorizontalScrollIndicator={false}>
            {photoUris.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.photoPreview} />
            ))}
          </ScrollView>
        ) : null}
        {photoUris.length > 0 ? (
          <DraftPhotoAllocation onChange={setPagePlans} photoUris={photoUris} value={pagePlans} />
        ) : null}
      </Section>

      {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}
      {photoUris.length > 0 ? (
        <AppButton label={isSaving ? "正在生成旅行册…" : "生成旅行册草稿"} tone="warm" disabled={isSaving || !canGenerate} onPress={() => void generate()} />
      ) : (
        <Text selectable style={styles.footNote}>选好照片后，这里会出现「生成旅行册草稿」。</Text>
      )}
      </ScrollView>

      {showDatePicker && Platform.OS === "android" ? (
        <DateTimePicker
          maximumDate={new Date()}
          minimumDate={MIN_TRAVEL_DATE}
          mode="date"
          onChange={handleDateChange}
          value={parseIsoTravelDate(travelDate)}
        />
      ) : null}

      {showDatePicker && Platform.OS === "ios" ? (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text selectable style={styles.sheetTitle}>选择旅行日期</Text>
            <DateTimePicker
              display="spinner"
              maximumDate={new Date()}
              minimumDate={MIN_TRAVEL_DATE}
              mode="date"
              onChange={handleDateChange}
              textColor={colors.ink}
              themeVariant="light"
              value={parseIsoTravelDate(travelDate)}
            />
            <AppButton label="完成" onPress={() => setShowDatePicker(false)} />
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

      {/* 自定义色盘弹层 */}
      {showColorPicker ? (
        <View style={styles.overlay}>
          <View style={styles.colorSheet}>
            <Text selectable style={styles.sheetTitle}>自定封面颜色</Text>
            <ColorPicker
              value={coverColor}
              onCommit={(hex) => {
                setCoverColor(hex);
                setCoverImage(undefined);
              }}
            />
            <View style={styles.colorSheetButtons}>
              <AppButton label="取消" tone="secondary" onPress={() => setShowColorPicker(false)} />
              <AppButton label="确认" onPress={() => { setShowColorPicker(false); void Haptics.selectionAsync(); }} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 22, padding: 20, paddingBottom: 40 },
  intro: { gap: 10 },
  introText: { color: colors.muted, fontSize: 14, lineHeight: 22 },
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
  formLabel: { color: colors.ink, fontFamily: serifFont, fontSize: 15.5, fontWeight: "700" },
  formInput: { color: colors.ink, flex: 1, fontSize: 15.5, textAlign: "right" },
  formValue: { color: colors.accent, fontSize: 15.5, fontWeight: "700" },
  photoStrip: { gap: 10 },
  photoPreview: { borderRadius: 12, height: 92, width: 92 },
  photoPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 6,
    justifyContent: "center",
    paddingVertical: 26,
  },
  photoPlaceholderGlyph: { color: colors.warmAccent, fontSize: 30, fontWeight: "300" },
  photoPlaceholderText: { color: colors.muted, fontSize: 13 },
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
  // ── 封面 ──
  coverPreviewRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  coverPreview: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    height: 56,
    overflow: "hidden",
    width: 72,
  },
  coverPreviewImage: { ...StyleSheet.absoluteFillObject, borderRadius: 11 },
  coverHintCol: { flex: 1, gap: 4 },
  coverHint: { color: colors.muted, flexShrink: 1, fontSize: 13, lineHeight: 19 },
  coverClearLink: { alignSelf: "flex-start" },
  coverClearText: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  swatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  swatch: {
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    width: 40,
  },
  swatchSelected: { borderColor: colors.ink, borderWidth: 3 },
  toolSwatch: {
    alignItems: "center",
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  toolSwatchText: { fontSize: 18 },
  // ── 色盘弹层 ──
  colorSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 16,
    maxHeight: "90%",
    padding: 20,
  },
  colorSheetButtons: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 8 },
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
