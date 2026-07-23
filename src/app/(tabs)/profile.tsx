import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ProfileAvatar } from "../../components/profile-avatar";
import { colors } from "../../components/ui";
import { listOrderIntents } from "../../features/commerce/shop/order-intent-store";
import { countSouvenirItems } from "../../features/commerce/shop/order-status";
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
  { key: "privacy", title: "本机数据与隐私声明", href: "/privacy" },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { memories, isReady } = useMemories();
  const { profile, isProfileReady } = useProfile();
  const summary = getProfileSummary(memories);
  const [souvenirCount, setSouvenirCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void listOrderIntents()
        .then((intents) => {
          if (isActive) setSouvenirCount(countSouvenirItems(intents));
        })
        .catch(() => undefined);
      return () => {
        isActive = false;
      };
    }, [])
  );

  if (!isReady || !isProfileReady) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.loading}>
        <Text selectable style={styles.bio}>正在读取本地记忆…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Pressable
        accessibilityLabel="打开设置"
        accessibilityRole="button"
        onPress={() => router.push("/settings")}
        style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
      >
        <ProfileAvatar avatarUri={profile.avatarUri} nickname={profile.nickname} size={72} />
        <View style={styles.heroCopy}>
          <Text selectable style={styles.nickname}>{profile.nickname}</Text>
          <Text numberOfLines={2} selectable style={styles.bio}>
            {profile.bio ?? DEFAULT_BIO}
          </Text>
        </View>
        <Text selectable style={styles.heroChevron}>›</Text>
      </Pressable>

      <View style={styles.stats}>
        <Statistic label="走过的城市" value={`${summary.cityCount} 座`} />
        <Statistic label="珍藏的旅行册" value={`${summary.memoryCount} 册`} />
        <Statistic label="收入的纪念品" value={`${souvenirCount} 件`} />
      </View>

      <View style={styles.listCard}>
        {listEntries.map((entry, index) => (
          <Pressable
            accessibilityRole="button"
            key={entry.key}
            onPress={() => router.push(entry.href)}
            style={({ pressed }) => [
              styles.listRow,
              index < listEntries.length - 1 && styles.listRowDivider,
              pressed && styles.pressed,
            ]}
          >
            <Text selectable style={styles.listTitle}>{entry.title}</Text>
            <Text selectable style={styles.listChevron}>›</Text>
          </Pressable>
        ))}
      </View>
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
  content: { gap: 18, padding: 20 },
  hero: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 22,
    flexDirection: "row",
    gap: 14,
    minHeight: 104,
    padding: 20,
  },
  heroCopy: { flex: 1, gap: 5 },
  nickname: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  bio: { color: colors.muted, fontSize: 13.5, lineHeight: 19 },
  heroChevron: { color: colors.muted, fontSize: 22, fontWeight: "600" },
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
  statValue: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  listCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
  },
  listRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  listRowDivider: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  listTitle: { color: colors.ink, fontSize: 15.5, fontWeight: "600" },
  listChevron: { color: colors.muted, fontSize: 18 },
  pressed: { opacity: 0.82 },
});
