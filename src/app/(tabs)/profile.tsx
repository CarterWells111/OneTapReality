import { useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { ProfileAvatar } from "../../components/profile-avatar";
import { colors, PaperCard, ScreenTitle, serifFont, SketchDivider } from "../../components/ui";
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

function SettingsGlyph() {
  return (
    <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
      <Path
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
        stroke={colors.muted}
        strokeWidth={1.4}
      />
    </Svg>
  );
}

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
        <Text selectable style={styles.bio}>正在读取记忆…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      style={styles.screen}
    >
      <ScreenTitle
        title="我的"
        caption="MY ARCHIVE"
        right={
          <Pressable
            accessibilityLabel="打开设置"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push("/settings")}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <SettingsGlyph />
          </Pressable>
        }
      />

      <PaperCard tone="paper" style={styles.hero}>
        <ProfileAvatar avatarUri={profile.avatarUri} nickname={profile.nickname} size={72} />
        <View style={styles.heroCopy}>
          <Text selectable style={styles.nickname}>{profile.nickname}</Text>
          <Text numberOfLines={2} selectable style={styles.bio}>
            {profile.bio ?? DEFAULT_BIO}
          </Text>
          <Pressable
            accessibilityLabel="编辑我的资料"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [styles.editRow, pressed && styles.pressed]}
          >
            <Text selectable style={styles.editText}>记录此刻的美好 ✎</Text>
          </Pressable>
        </View>
      </PaperCard>

      <View style={styles.stats}>
        <Statistic label="旅行记忆" value={`${summary.memoryCount}`} unit="册" />
        <Statistic label="城市足迹" value={`${summary.cityCount}`} unit="座" />
        <Statistic label="已收录照片" value={`${summary.photoCount}`} unit="张" />
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
  content: { gap: 18, padding: 20, paddingBottom: 36 },
  hero: { alignItems: "center", flexDirection: "row", gap: 14, minHeight: 104 },
  heroCopy: { flex: 1, gap: 5 },
  nickname: { color: colors.ink, fontFamily: serifFont, fontSize: 22, fontWeight: "800" },
  bio: { color: colors.muted, fontSize: 13.5, lineHeight: 20 },
  editRow: { alignSelf: "flex-start", paddingVertical: 2 },
  editText: { color: colors.warmAccent, fontSize: 13, fontWeight: "700" },
  stats: { flexDirection: "row", gap: 10 },
  statCard: { alignItems: "flex-start", flex: 1, gap: 4, minHeight: 84, padding: 14 },
  statValueRow: { alignItems: "baseline", flexDirection: "row", gap: 3 },
  statValue: { color: colors.warmAccent, fontFamily: serifFont, fontSize: 26, fontWeight: "800" },
  statUnit: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  listCard: { paddingHorizontal: 16, paddingVertical: 2 },
  listRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
  },
  rowDivider: { bottom: 0, left: 0, position: "absolute", right: 0 },
  listTitle: { color: colors.ink, fontSize: 15.5, fontWeight: "600" },
  listChevron: { color: colors.muted, fontSize: 18 },
  quoteCard: { alignItems: "flex-start", gap: 4, marginTop: 2 },
  quoteRule: { backgroundColor: colors.warmAccent, borderRadius: 2, height: 3, marginBottom: 6, width: 28 },
  quoteText: { color: colors.ink, fontFamily: serifFont, fontSize: 16, lineHeight: 26 },
  pressed: { opacity: 0.82 },
});
