import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as React from "react";

import { MemoryBookCover } from "../../components/memory-book-cover";
import { AppButton, bodyFont, colors, PaperCard, Section, serifFont, Tag } from "../../components/ui";
import { useAuth } from "../../features/auth/auth-provider";
import { useLocalLibrary } from "../../features/auth/local-library-provider";
import { useMemories } from "../../features/memories/memories-provider";
import { sampleMemory } from "../../features/memories/sample-memory";
import { showShareActionSheet } from "../../features/export/share-action-sheet";
import { GiftNfcScanner } from "../../features/gifts/gift-nfc-scanner";

export default function MemoriesHomeScreen() {
  const router = useRouter();
  const { memories, isReady, discardMemory } = useMemories();
  const { isAuthReady, user } = useAuth();
  const {
    continueWithGuest,
    isReady: isLocalLibraryReady,
    isMigrating,
    migrateToAccount,
    needsMigrationChoice,
    owner: localLibraryOwner,
  } = useLocalLibrary();
  const [multiSelect, setMultiSelect] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  const enterMultiSelect = (id: string) => {
    setMultiSelect(true);
    setSelectedIds([id]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === memories.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(memories.map((m) => m.id));
    }
  };

  const exitMultiSelect = () => {
    setMultiSelect(false);
    setSelectedIds([]);
  };

  const shareSelected = () => {
    if (selectedIds.length !== 1) return;
    const selected = memories.filter((m) => selectedIds.includes(m.id));
    if (selected.length !== 1) return;
    const memory = selected[0];
    showShareActionSheet({
      coverImage: memory.coverImage,
      pages: memory.pages,
      photoUris: memory.photoUris,
      title: memory.title,
    });
  };

  const confirmDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    Alert.alert(
      `删除 ${selectedIds.length} 册旅行记忆？`,
      "会移入回收站，可在回收站里恢复或彻底删除。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            for (const id of selectedIds) {
              await discardMemory(id);
            }
            exitMultiSelect();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.screen}
    >
      <PaperCard tone="paper" style={styles.hero}>
        <Tag label="旅行手账" />
        <Text selectable style={styles.title}>OneTapReality｜一触如初</Text>
        <View style={styles.rule} />
        <Text selectable style={styles.heroHeadline}>把旅程留成一册</Text>
        <Text selectable style={styles.subtitle}>让每一次触碰，都回到故事最初的地方。</Text>
        <Text selectable style={styles.subtitle}>
          选择照片，开启一册专属你们的旅行记忆。
        </Text>
        <Text selectable style={styles.subtitle}>本地规则生成的可编辑初稿，不分析照片内容</Text>
        <Text selectable style={styles.subtitle}>本地草稿默认保存在此设备；只有你主动发布礼品时，所选内容才会上传给受邀成员。</Text>
        <View style={styles.heroActions}>
          <AppButton disabled={!isLocalLibraryReady || isMigrating} label="创建纪念册" tone="warm" onPress={() => router.push("/memory/new")} />
          <AppButton
            disabled={!isAuthReady}
            label="我的纪念品"
            tone="secondary"
            onPress={() => {
              if (isAuthReady) {
                router.push((user ? "/gifts" : "/login?returnTo=/gifts") as never);
              }
            }}
          />
          <GiftNfcScanner />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/memory/[id]", params: { id: sampleMemory.id } })}
          style={({ pressed }) => [styles.heroLink, pressed && styles.pressed]}
        >
          <Text selectable style={styles.heroLinkText}>先翻一册杭州示例 ›</Text>
        </Pressable>
      </PaperCard>

      {isAuthReady ? (
        <PaperCard style={styles.accountCard}>
          <View style={styles.accountCopy}>
            <Text selectable style={styles.accountTitle}>{user ? "当前账户" : "保存和管理你的 NFC 纪念品"}</Text>
            <Text selectable style={styles.accountEmail}>
              {user?.email ?? "使用邮箱验证码登录，无需设置密码。"}
            </Text>
          </View>
          <AppButton
            label={user ? "账户" : "登录 / 注册"}
            tone="secondary"
            onPress={() => router.push((user ? "/(tabs)/profile" : "/login?returnTo=/") as never)}
          />
        </PaperCard>
      ) : null}

      {needsMigrationChoice ? (
        <PaperCard style={styles.accountCard}>
          <Text selectable style={styles.accountTitle}>选择本机旅行册</Text>
          <Text selectable style={styles.accountEmail}>
            此设备上已有访客旅行册。你可以继续使用访客库，或将它完整迁移到 {user?.email}。我们不会自动移动任何内容。
          </Text>
          <AppButton
            disabled={isMigrating}
            label="继续使用访客旅行册"
            tone="secondary"
            onPress={() => void Promise.resolve().then(continueWithGuest).catch(() => Alert.alert("无法保存选择", "请稍后重试。"))}
          />
          <AppButton
            disabled={isMigrating}
            label={isMigrating ? "正在迁移…" : "迁移到当前账户"}
            onPress={() => void Promise.resolve().then(migrateToAccount).catch(() => Alert.alert("迁移未完成", "访客旅行册仍保留在本机，请稍后重试。"))}
          />
        </PaperCard>
      ) : null}

      <Section
        title={isReady && memories.length > 0 ? `我的旅行册 · ${memories.length}` : "我的旅行册"}
        caption="MY TRAVEL ALBUMS"
      >
        {!isReady ? (
          <Text selectable style={styles.mutedText}>正在读取记忆…</Text>
        ) : memories.length > 0 ? (
          <>
            {/* 多选模式操作栏 */}
            {multiSelect ? (
              <View style={styles.selectionBar}>
                <Pressable
                  accessibilityLabel="全选"
                  accessibilityRole="button"
                  onPress={selectAll}
                  style={styles.selectionAction}
                >
                  <Text style={styles.selectionActionText}>
                    {selectedIds.length === memories.length ? "取消全选" : "全选"}
                  </Text>
                </Pressable>
                <Text style={styles.selectionCount}>已选 {selectedIds.length}</Text>
                <Pressable
                  accessibilityLabel="分享所选"
                  accessibilityRole="button"
                  disabled={selectedIds.length !== 1}
                  onPress={shareSelected}
                  style={[styles.selectionAction, selectedIds.length !== 1 && styles.disabledAction]}
                >
                  <Text style={[styles.selectionShareText, selectedIds.length !== 1 && styles.disabledText]}>分享</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="删除所选"
                  accessibilityRole="button"
                  disabled={selectedIds.length === 0}
                  onPress={confirmDeleteSelected}
                  style={[styles.selectionAction, selectedIds.length === 0 && styles.disabledAction]}
                >
                  <Text style={[styles.selectionDangerText, selectedIds.length === 0 && styles.disabledText]}>删除所选</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="取消多选"
                  accessibilityRole="button"
                  onPress={exitMultiSelect}
                  style={styles.selectionAction}
                >
                  <Text style={styles.selectionCancelText}>取消</Text>
                </Pressable>
              </View>
            ) : null}
            {multiSelect && selectedIds.length > 1 ? (
              <Text selectable style={styles.selectionHelp}>一次只能分享一本，请只保留一本旅行册。</Text>
            ) : null}
            <View style={styles.bookGrid}>
              {memories.map((memory) => (
                <MemoryBookCover
                  key={memory.id}
                  memory={memory}
                  multiSelect={multiSelect}
                  selected={selectedIds.includes(memory.id)}
                  onPress={() => {
                    if (multiSelect) {
                      toggleSelect(memory.id);
                    } else {
                      router.push({ pathname: "/memory/[id]", params: { id: memory.id } });
                    }
                  }}
                  onLongPress={() => enterMultiSelect(memory.id)}
                />
              ))}
            </View>
          </>
        ) : (
          <PaperCard style={styles.emptyCard}>
            <Text selectable style={styles.emptyTitle}>还没有保存的旅行册</Text>
            <Text selectable style={styles.mutedText}>
              从一组照片开始，留住你们下一段一起出发的日子。
            </Text>
            <AppButton disabled={!isLocalLibraryReady} label="从第一段旅程开始" onPress={() => router.push("/memory/new")} />
          </PaperCard>
        )}
      </Section>

      <Text selectable style={styles.footer}>
        {localLibraryOwner === "guest" ? "当前使用本机访客旅行册。" : "每一册旅行记忆，都是独一无二的故事。"}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { gap: 22, padding: 20, paddingTop: 12, paddingBottom: 36 },
  hero: { gap: 10 },
  title: { color: colors.ink, fontFamily: serifFont, fontSize: 26, fontWeight: "800", marginTop: 2 },
  rule: { backgroundColor: colors.warmAccent, borderRadius: 2, height: 3, width: 36 },
  heroHeadline: { color: colors.warmAccent, fontFamily: serifFont, fontSize: 18, fontWeight: "800" },
  subtitle: { color: colors.muted, fontFamily: bodyFont, fontSize: 15, lineHeight: 23 },
  heroActions: { gap: 10, marginTop: 4 },
  accountCard: { alignItems: "stretch", gap: 12 },
  accountCopy: { gap: 4 },
  accountTitle: { color: colors.ink, fontFamily: bodyFont, fontSize: 15, fontWeight: "800" },
  accountEmail: { color: colors.muted, fontFamily: bodyFont, fontSize: 13.5, lineHeight: 20 },
  heroLink: { alignSelf: "flex-start", justifyContent: "center", minHeight: 40 },
  heroLinkText: { color: colors.accent, fontFamily: bodyFont, fontSize: 14, fontWeight: "800" },
  bookGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16 },
  selectionBar: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectionCount: { color: colors.ink, flex: 1, fontFamily: bodyFont, fontSize: 14, fontWeight: "800" },
  selectionAction: { paddingHorizontal: 8, paddingVertical: 4 },
  selectionActionText: { color: colors.accent, fontFamily: bodyFont, fontSize: 14, fontWeight: "800" },
  selectionDangerText: { color: colors.danger, fontFamily: bodyFont, fontSize: 14, fontWeight: "800" },
  selectionShareText: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, fontWeight: "800" },
  selectionCancelText: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  disabledAction: { opacity: 0.4 },
  disabledText: { opacity: 0.4 },
  selectionHelp: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, lineHeight: 20 },
  emptyCard: { gap: 12 },
  emptyTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 17, fontWeight: "700" },
  mutedText: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 21 },
  footer: { color: colors.muted, fontFamily: bodyFont, fontSize: 12.5, textAlign: "center" },
  pressed: { opacity: 0.85 },
});
