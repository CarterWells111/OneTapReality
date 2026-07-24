import { useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileAvatar } from "../../components/profile-avatar";
import { bodyFont, colors, PaperCard, ScreenTitle, serifFont, SketchDivider } from "../../components/ui";
import { useMemories } from "../../features/memories/memories-provider";
import { DEFAULT_BIO } from "../../features/profile/local-profile";
import { useProfile } from "../../features/profile/profile-provider";
import { getProfileSummary } from "../../features/profile/profile-summary";

type ListEntry = {
  key: string;
  title: string;
  href: Href;
};

const listEntries: ListEntry[] = [
  { key: "orders", title: "我的订单", href: "/shop/orders" },
  { key: "favorites", title: "我的收藏", href: "/shop/favorites" },
  { key: "cities", title: "去过的城市", href: "/cities" },
  { key: "recycle-bin", title: "回收站", href: "/recycle-bin" },
  { key: "feedback", title: "意见反馈", href: "/feedback" },
  { key: "privacy", title: "数据与隐私", href: "/privacy" },
];

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { memories, isReady } = useMemories();
  const { profile, isProfileReady } = useProfile();
  const summary = getProfileSummary(memories);

  if (!isReady || !isProfileReady) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.loading, { paddingTop: insets.top + 12 }]}
        style={styles.screen}
      >
        <Text selectable style={styles.loadingText}>正在读取记忆…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.screen}
    >
      <ScreenTitle title="我的" caption="MY ARCHIVE" />

      <Pressable
        accessibilityLabel="编辑个人资料"
        accessibilityRole="button"
        onPress={() => router.push("/settings")}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <PaperCard tone="paper" style={styles.hero}>
          <ProfileAvatar avatarUri={profile.avatarUri} nickname={profile.nickname} size={72} />
          <View style={styles.heroCopy}>
            <Text selectable style={styles.nickname}>{profile.nickname}</Text>
            <Text numberOfLines={2} selectable style={styles.bio}>
              {profile.bio ?? DEFAULT_BIO}
            </Text>
            <View style={styles.editRow}>
              <Text selectable style={styles.editText}>记录此刻的美好 ✎</Text>
            </View>
          </View>
        </PaperCard>
      </Pressable>

      <View style={styles.stats}>
        <Pressable
          accessibilityLabel="旅行记忆"
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)")}
          style={({ pressed }) => [pressed && styles.pressed, { flex: 1 }]}>
          <Statistic label="旅行记忆" value={`${summary.memoryCount}`} unit="册" />
        </Pressable>
        <Pressable
          accessibilityLabel="城市足迹"
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/cities")}
          style={({ pressed }) => [pressed && styles.pressed, { flex: 1 }]}>
          <Statistic label="城市足迹" value={`${summary.cityCount}`} unit="座" />
        </Pressable>
        <Pressable
          accessibilityLabel="已收录照片"
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)")}
          style={({ pressed }) => [pressed && styles.pressed, { flex: 1 }]}>
          <Statistic label="已收录照片" value={`${summary.photoCount}`} unit="张" />
        </Pressable>
      </View>

      <PaperCard style={styles.listCard}>
        {listEntries.map((entry, index) => (
          <Pressable
            accessibilityRole="button"
            key={entry.key}
            onPress={() => router.push(entry.href)}
            style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
          >
            <Text selectable style={styles.listTitle}>{entry.title}</Text>
            <Text selectable style={styles.listChevron}>›</Text>
            {index < listEntries.length - 1 ? <SketchDivider style={styles.rowDivider} /> : null}
          </Pressable>
        ))}
      </PaperCard>

      <PaperCard tone="paper" style={styles.quoteCard}>
        <View style={styles.quoteRule} />
        <Text selectable style={styles.quoteText}>愿你总有地方可去，</Text>
        <Text selectable style={styles.quoteText}>也总有记忆可回。</Text>
      </PaperCard>
    </ScrollView>
  );
}

function Statistic({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <PaperCard style={styles.statCard}>
      <View style={styles.statValueRow}>
        <Text selectable style={styles.statValue}>{value}</Text>
        <Text selectable style={styles.statUnit}>{unit}</Text>
      </View>
      <Text selectable style={styles.statLabel}>{label}</Text>
    </PaperCard>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  loading: { padding: 20 },
  loadingText: { color: colors.muted, fontFamily: bodyFont, fontSize: 14 },
  content: { gap: 18, padding: 20, paddingTop: 12, paddingBottom: 36 },
  hero: { alignItems: "center", flexDirection: "row", gap: 14, minHeight: 104 },
  heroCopy: { flex: 1, gap: 5 },
  nickname: { color: colors.ink, fontFamily: serifFont, fontSize: 22, fontWeight: "800" },
  bio: { color: colors.muted, fontFamily: bodyFont, fontSize: 13.5, lineHeight: 20 },
  editRow: { alignSelf: "flex-start", paddingVertical: 2 },
  editText: { color: colors.warmAccent, fontFamily: bodyFont, fontSize: 13, fontWeight: "700" },
  stats: { flexDirection: "row", gap: 10 },
  statCard: { alignItems: "flex-start", flex: 1, gap: 4, minHeight: 84, padding: 14 },
  statValueRow: { alignItems: "baseline", flexDirection: "row", gap: 3 },
  statValue: { color: colors.warmAccent, fontFamily: serifFont, fontSize: 26, fontWeight: "800" },
  statUnit: { color: colors.muted, fontFamily: bodyFont, fontSize: 12, fontWeight: "700" },
  statLabel: { color: colors.muted, fontFamily: bodyFont, fontSize: 12, fontWeight: "700" },
  listCard: { paddingHorizontal: 16, paddingVertical: 2 },
  listRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
  },
  rowDivider: { bottom: 0, left: 0, position: "absolute", right: 0 },
  listTitle: { color: colors.ink, fontFamily: bodyFont, fontSize: 15.5, fontWeight: "600" },
  listChevron: { color: colors.muted, fontFamily: bodyFont, fontSize: 18 },
  quoteCard: { alignItems: "flex-start", gap: 4, marginTop: 2 },
  quoteRule: { backgroundColor: colors.warmAccent, borderRadius: 2, height: 3, marginBottom: 6, width: 28 },
  quoteText: { color: colors.ink, fontFamily: serifFont, fontSize: 16, lineHeight: 26 },
  pressed: { opacity: 0.82 },
});
