import { useRouter, type Href } from "expo-router";
import * as React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileAvatar } from "../../components/profile-avatar";
import { AppButton, bodyFont, colors, PaperCard, ScreenTitle, serifFont, SketchDivider } from "../../components/ui";
import { useAuth } from "../../features/auth/auth-provider";
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
  { key: "nfc-gifts", title: "我的纪念品", href: "/gifts" },
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
  const { isAuthReady, signOut, switchAccount, user } = useAuth();
  const [accountBusy, setAccountBusy] = React.useState(false);
  const [accountError, setAccountError] = React.useState<string | null>(null);
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

  const changeAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountError(null);
    try {
      await switchAccount();
      router.push("/login?returnTo=/(tabs)/profile");
    } catch {
      setAccountError("无法切换账号，请重试。");
    } finally {
      setAccountBusy(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert("退出登录？", "本机旅行册、头像和昵称会继续保留。", [
      { text: "取消", style: "cancel" },
      {
        text: "退出登录",
        style: "destructive",
        onPress: () => {
          if (accountBusy) return;
          setAccountBusy(true);
          setAccountError(null);
          void signOut()
            .catch(() => setAccountError("无法退出登录，请重试。"))
            .finally(() => setAccountBusy(false));
        },
      },
    ]);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.screen}
    >
      <ScreenTitle title="我的" caption="MY ARCHIVE" />

      <PaperCard tone="paper" style={styles.accountCard}>
        <View style={styles.accountCopy}>
          <Text selectable style={styles.accountTitle}>
            {!isAuthReady ? "正在读取账户…" : user ? "OneTapReality 账户" : "登录 OneTapReality"}
          </Text>
          <Text selectable style={styles.accountEmail}>
            {!isAuthReady
              ? "正在检查本机保存的登录状态。"
              : user?.email ?? "登录后可认领和管理 NFC 纪念品。"}
          </Text>
          {user?.isAdmin ? <Text selectable style={styles.adminBadge}>开发者管理员</Text> : null}
          {accountError ? <Text selectable style={styles.accountError}>{accountError}</Text> : null}
        </View>
        {!isAuthReady ? null : user ? (
          <View style={styles.accountActions}>
            <AppButton disabled={accountBusy} label="切换账号" tone="secondary" onPress={() => void changeAccount()} />
            <AppButton disabled={accountBusy} label="退出登录" tone="danger" onPress={confirmSignOut} />
          </View>
        ) : (
          <AppButton label="登录 / 注册" onPress={() => router.push("/login?returnTo=/(tabs)/profile")} />
        )}
      </PaperCard>

      <Pressable
        accessibilityLabel="打开设置"
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
  accountCard: { gap: 14 },
  accountCopy: { gap: 5 },
  accountTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 18, fontWeight: "800" },
  accountEmail: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 21 },
  adminBadge: { color: colors.warmAccent, fontFamily: bodyFont, fontSize: 12.5, fontWeight: "800" },
  accountError: { color: colors.danger, fontFamily: bodyFont, fontSize: 13, lineHeight: 19 },
  accountActions: { gap: 10 },
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
