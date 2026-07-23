import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, Section } from "../../components/ui";
import { cityContent } from "../../features/cities/city-content";
import { useMemories } from "../../features/memories/memories-provider";
import type { Memory } from "../../types/memory";

export default function RecycleBinScreen() {
  const { listDiscarded, restoreMemory, deleteMemory } = useMemories();
  const [discarded, setDiscarded] = useState<Memory[]>([]);
  const [isReady, setIsReady] = useState(false);

  const load = useCallback(async () => {
    const stored = await listDiscarded();
    setDiscarded(stored);
    setIsReady(true);
  }, [listDiscarded]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const restore = async (id: string) => {
    await restoreMemory(id);
    await load();
  };

  const confirmDelete = (memory: Memory) => {
    Alert.alert("彻底删除", `将从这台设备上永久删除「${memory.title}」，且无法恢复。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await deleteMemory(memory.id);
            await load();
          })();
        },
      },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text selectable style={styles.title}>
          回收站{isReady ? ` · ${discarded.length} 册` : ""}
        </Text>
        <Text selectable style={styles.subtitle}>
          丢弃的旅行册会先留在这里，可以恢复，也可以彻底删除。
        </Text>
      </View>

      {!isReady ? (
        <Text selectable style={styles.subtitle}>正在读取本机记录…</Text>
      ) : discarded.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text selectable style={styles.emptyTitle}>回收站是空的</Text>
          <Text selectable style={styles.subtitle}>丢弃的旅行册草稿会出现在这里。</Text>
        </View>
      ) : (
        <Section title="已丢弃的旅行册">
          <View style={styles.list}>
            {discarded.map((memory) => (
              <View key={memory.id} style={styles.card}>
                <Text selectable style={styles.cardTitle}>{memory.title}</Text>
                <Text selectable style={styles.cardLine}>
                  {cityContent[memory.city].name} · {memory.travelDate} · 照片 {memory.photoUris.length} 张
                </Text>
                <View style={styles.cardActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void restore(memory.id)}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                  >
                    <Text selectable style={styles.actionText}>恢复</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => confirmDelete(memory)}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                  >
                    <Text selectable style={styles.actionDangerText}>彻底删除</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </Section>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20, paddingBottom: 40 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 20, gap: 8, padding: 18 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  list: { gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  cardTitle: { color: colors.ink, fontSize: 15.5, fontWeight: "800" },
  cardLine: { color: colors.muted, fontSize: 13.5, lineHeight: 19 },
  cardActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  actionButton: { justifyContent: "center", minHeight: 40 },
  actionText: { color: colors.accent, fontSize: 14.5, fontWeight: "800" },
  actionDangerText: { color: colors.danger, fontSize: 14.5, fontWeight: "800" },
  pressed: { opacity: 0.82 },
});
