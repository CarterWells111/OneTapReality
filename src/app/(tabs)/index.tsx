import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MemoryCard } from "../../components/memory-card";
import { AppButton, colors, Section } from "../../components/ui";
import { useMemories } from "../../features/memories/memories-provider";
import { sampleMemory } from "../../features/memories/sample-memory";
import { getProfileSummary } from "../../features/profile/profile-summary";

export default function MemoriesHomeScreen() {
  const router = useRouter();
  const { memories, isReady } = useMemories();
  const summary = getProfileSummary(memories);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text selectable style={styles.eyebrow}>OneTapReality · 一触如初</Text>
        <Text selectable style={styles.title}>把旅程留成一册</Text>
        <Text selectable style={styles.subtitle}>
          让每一次触碰，都回到故事最初的地方。选照片、写几句，本地草稿即刻成册。
        </Text>
        <AppButton label="创建纪念册" onPress={() => router.push("/memory/new")} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/memory/[id]", params: { id: sampleMemory.id } })}
          style={({ pressed }) => [styles.heroLink, pressed && styles.pressed]}
        >
          <Text selectable style={styles.heroLinkText}>先翻一册杭州示例 ›</Text>
        </Pressable>
      </View>

      {isReady && memories.length > 0 ? (
        <View style={styles.stats}>
          <Statistic label="旅行记忆" value={`${summary.memoryCount} 册`} />
          <Statistic label="城市足迹" value={`${summary.cityCount} 座`} />
          <Statistic label="已收录照片" value={`${summary.photoCount} 张`} />
        </View>
      ) : null}

      <Section title={isReady && memories.length > 0 ? `我的旅行册 · ${memories.length}` : "我的旅行册"}>
        {!isReady ? (
          <Text selectable style={styles.mutedText}>正在读取本地记忆…</Text>
        ) : memories.length > 0 ? (
          <View style={styles.list}>
            {memories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onPress={() => router.push({ pathname: "/memory/[id]", params: { id: memory.id } })}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text selectable style={styles.emptyTitle}>还没有保存的旅行册</Text>
            <Text selectable style={styles.mutedText}>
              从一组照片开始，留住你们下一段一起出发的日子。
            </Text>
            <AppButton label="从第一段旅程开始" onPress={() => router.push("/memory/new")} />
          </View>
        )}
      </Section>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/shop")}
        style={({ pressed }) => [styles.shopCard, pressed && styles.pressed]}
      >
        <View style={styles.shopCopy}>
          <Text selectable style={styles.shopEyebrow}>纪念品商店</Text>
          <Text selectable style={styles.shopTitle}>把回忆做成实物</Text>
          <Text selectable style={styles.mutedText}>
            城市限定纪念钥匙、打印旅行册，可选样式、可刻字。
          </Text>
        </View>
        <Text selectable style={styles.shopArrow}>→</Text>
      </Pressable>

      <Text selectable style={styles.footer}>每一册和每一张照片，都只保存在这台设备上。</Text>
    </ScrollView>
  );
}

function Statistic({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text selectable style={styles.statValue}>{value}</Text>
      <Text selectable style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20, paddingBottom: 36 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 22, gap: 10, padding: 20 },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  heroLink: { alignSelf: "flex-start", justifyContent: "center", minHeight: 40 },
  heroLinkText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 8 },
  statCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 84,
    padding: 12,
  },
  statValue: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  list: { gap: 12 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  mutedText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  shopCard: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.warmAccent,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 96,
    padding: 16,
  },
  shopCopy: { flex: 1, gap: 4 },
  shopEyebrow: { color: colors.warmAccent, fontSize: 12.5, fontWeight: "800" },
  shopTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  shopArrow: { color: colors.warmAccent, fontSize: 24, fontWeight: "800" },
  footer: { color: colors.muted, fontSize: 12.5, textAlign: "center" },
  pressed: { opacity: 0.85 },
});
