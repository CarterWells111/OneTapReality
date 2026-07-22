import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import { AppButton, colors } from "../../../components/ui";
import { useMemories } from "../../../features/memories/memories-provider";
import type { StoryPage } from "../../../types/memory";

export default function EditMemoryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMemoryById, updatePages } = useMemories();
  const memory = getMemoryById(id);
  const [edits, setEdits] = React.useState<Record<string, Partial<StoryPage>>>({});
  const [isSaving, setIsSaving] = React.useState(false);

  if (!memory) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20 }}>
        <Text selectable style={{ color: colors.muted }}>正在读取可编辑的旅行册…</Text>
      </ScrollView>
    );
  }

  const pages = memory.pages.map((page) => ({ ...page, ...edits[page.id] }));

  const updatePage = (idToUpdate: string, field: "headline" | "body", value: string) => {
    setEdits((current) => ({
      ...current,
      [idToUpdate]: { ...current[idToUpdate], [field]: value },
    }));
  };

  const save = async () => {
    setIsSaving(true);
    await updatePages(memory, pages);
    setIsSaving(false);
    router.back();
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 18, padding: 20 }}>
      <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>
        本版草稿完全由本地模板生成。你可以把每一页改成真正属于你们的文字。
      </Text>
      {pages.map((page, index) => (
        <View key={page.id} style={{ backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 10, padding: 16 }}>
          <Text selectable style={{ color: colors.muted, fontWeight: "700" }}>第 {index + 1} 页</Text>
          <TextInput
            accessibilityLabel={`第 ${index + 1} 页标题`}
            onChangeText={(value) => updatePage(page.id, "headline", value)}
            style={{ borderBottomColor: colors.line, borderBottomWidth: 1, color: colors.ink, fontSize: 18, fontWeight: "700", minHeight: 42 }}
            value={page.headline}
          />
          <TextInput
            accessibilityLabel={`第 ${index + 1} 页正文`}
            multiline
            onChangeText={(value) => updatePage(page.id, "body", value)}
            style={{ color: colors.ink, lineHeight: 22, minHeight: 88, textAlignVertical: "top" }}
            value={page.body}
          />
        </View>
      ))}
      <AppButton label={isSaving ? "正在保存…" : "保存修改"} disabled={isSaving} onPress={() => void save()} />
    </ScrollView>
  );
}
