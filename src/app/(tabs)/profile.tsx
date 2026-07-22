import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MemoryCard } from "../../components/memory-card";
import { ProfileAvatar } from "../../components/profile-avatar";
import { AppButton, colors, Section } from "../../components/ui";
import { getProfileSummary } from "../../features/profile/profile-summary";
import { useProfile } from "../../features/profile/profile-provider";
import { useMemories } from "../../features/memories/memories-provider";

export default function ProfileScreen() {
  const router = useRouter();
  const { memories, isReady, clearAllMemories } = useMemories();
  const { profile, isProfileReady } = useProfile();
  const summary = getProfileSummary(memories);

  const openMemory = (id: string) => {
    router.push({ pathname: "/memory/[id]", params: { id } });
  };

  const confirmClear = () => {
    Alert.alert("删除所有本地记忆？", "这会删除这台设备上的旅行册、照片引用和草稿，操作不可恢复。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => void clearAllMemories() },
    ]);
  };

  if (!isReady || !isProfileReady) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.loading}>
        <Text selectable style={styles.subtitle}>正在读取本地记忆…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.profileHeader}>
          <ProfileAvatar avatarUri={profile.avatarUri} nickname={profile.nickname} />
          <View style={styles.profileCopy}>
            <Text selectable style={styles.nickname}>{profile.nickname}</Text>
            <Pressable
              accessibilityLabel="打开设置"
              accessibilityRole="button"
              onPress={() => router.push("/settings")}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
            >
              <Text selectable style={styles.settingsButtonText}>设置</Text>
            </Pressable>
          </View>
        </View>
        <Text selectable style={styles.eyebrow}>旅忆 · 共同档案</Text>
        <Text selectable style={styles.title}>我们的旅行档案</Text>
        <Text selectable style={styles.subtitle}>每一册和每一张照片都只保存在这台设备上。</Text>
      </View>

      <Section title="回忆概览">
        <View style={styles.stats}>
          <Statistic label="旅行记忆" value={`${summary.memoryCount} 册`} />
          <Statistic label="城市足迹" value={`${summary.cityCount} 座`} />
          <Statistic label="已收录照片" value={`${summary.photoCount} 张`} />
        </View>
      </Section>

      <Section title="最近回忆">
        {summary.recentMemory ? (
          <MemoryCard memory={summary.recentMemory} onPress={() => openMemory(summary.recentMemory!.id)} />
        ) : (
          <View style={styles.emptyCard}>
            <Text selectable style={styles.emptyTitle}>还没有保存的旅行记忆</Text>
            <Text selectable style={styles.subtitle}>从一组照片开始，留住你们下一段一起出发的日子。</Text>
            <AppButton label="从第一段旅程开始" onPress={() => router.push("/memory/new")} />
          </View>
        )}
      </Section>

      <Section title="下一步">
        <View style={styles.actionGroup}>
          <AppButton label="继续创建旅行册" onPress={() => router.push("/memory/new")} />
          <AppButton label="查看城市收藏" onPress={() => router.push("/cities")} tone="secondary" />
        </View>
        {summary.recentMemory ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => openMemory(summary.recentMemory!.id)}
            style={({ pressed }) => [styles.giftCard, pressed && styles.pressed]}>
            <View style={styles.giftCopy}>
              <Text selectable style={styles.giftTitle}>把这册回忆做成礼物</Text>
              <Text selectable style={styles.subtitle}>进入旅行册，继续设计值得收藏的一份纪念。</Text>
            </View>
            <Text selectable style={styles.giftArrow}>→</Text>
          </Pressable>
        ) : null}
      </Section>

      <Section title="本机数据与隐私">
        <View style={styles.infoCard}>
          <Text selectable style={styles.infoTitle}>本版不上传任何照片</Text>
          <Text selectable style={styles.subtitle}>
            旅行信息、照片 URI 和旅行册内容仅保存在本机 SQLite 中。AI 为固定本地演示草稿，不识别人物或地点。
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text selectable style={styles.infoTitle}>NFC 体验状态</Text>
          <Text selectable style={styles.subtitle}>Expo Go 仅展示模拟碰一碰；真实 NFC 会在 Development Build 阶段接入。</Text>
        </View>
        <AppButton label="删除所有本地数据" onPress={confirmClear} tone="danger" />
      </Section>
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
  loading: { padding: 20 },
  content: { gap: 22, padding: 20 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 22, gap: 8, padding: 20 },
  profileHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  profileCopy: { flex: 1, gap: 4 },
  nickname: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  settingsButton: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44, minWidth: 44, paddingHorizontal: 8 },
  settingsButtonText: { color: colors.accent, fontSize: 15, fontWeight: "800" },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, lineHeight: 21 },
  stats: { flexDirection: "row", gap: 8 },
  statCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 14, borderWidth: 1, flex: 1, gap: 4, minHeight: 88, padding: 12 },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 12, padding: 18 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  actionGroup: { gap: 10 },
  giftCard: { alignItems: "center", backgroundColor: colors.accentSoft, borderColor: colors.line, borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 12, justifyContent: "space-between", marginTop: 12, minHeight: 88, padding: 16 },
  giftCopy: { flex: 1, gap: 5 },
  giftTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  giftArrow: { color: colors.warmAccent, fontSize: 24, fontWeight: "800" },
  infoCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 },
  infoTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.82 },
});
