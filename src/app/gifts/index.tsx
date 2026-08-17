import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, bodyFont, colors, ScreenTitle, Section, serifFont } from "../../components/ui";
import { useAuth } from "../../features/auth/auth-provider";
import { BackendApiClient, type InvitedGift } from "../../services/backend/api-client";

type OwnedGift = { id: string; status: string; claimedAt: string | null; album: { title: string; albumId: string; publishedAt: string; version: number; cover: { readUrl: string } | null } | null };

function CoverThumb({ uri, title }: { uri?: string | null; title: string }) {
  return uri ? (
    <Image contentFit="cover" source={{ uri }} style={styles.coverThumb} testID="souvenir-cover" />
  ) : (
    <View style={[styles.coverThumb, styles.coverFallback]}>
      <Text numberOfLines={2} selectable style={styles.coverFallbackText}>{title}</Text>
    </View>
  );
}

export default function MyGiftsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ open?: string; memoryId?: string }>();
  const { isAuthReady, session } = useAuth();
  const [message, setMessage] = React.useState("正在读取你的纪念品…");
  const [owned, setOwned] = React.useState<OwnedGift[]>([]);
  const [invited, setInvited] = React.useState<InvitedGift[]>([]);
  const [loadedContextKey, setLoadedContextKey] = React.useState<string | null>(null);
  const handledOpenRef = React.useRef(false);
  const requestGeneration = React.useRef(0);
  const client = React.useMemo(() => new BackendApiClient(), []);
  const sessionContextKey = session ? `${session.user.id}\u0000${session.accessToken}` : null;

  const load = React.useCallback(async (generation = requestGeneration.current, isActive: () => boolean = () => true) => {
    const capturedContextKey = sessionContextKey;
    const canCommit: () => boolean = () => isActive() && requestGeneration.current === generation;
    if (!session) {
      if (!canCommit()) return;
      setOwned([]);
      setInvited([]);
      setLoadedContextKey(null);
      setMessage("登录后可查看你管理和获赠的 NFC 纪念品。");
      return;
    }
    try {
      const [ownedResult, invitedResult] = await Promise.all([
        client.listOwnedGifts(session.accessToken),
        client.listInvitedGifts(session.accessToken),
      ]);
      if (!canCommit()) return;
      setOwned(ownedResult);
      setInvited(invitedResult);
      setLoadedContextKey(capturedContextKey);
      if (!ownedResult.length && !invitedResult.length) {
        setMessage("你还没有任何 NFC 纪念品。触碰 NFC 标签即可绑定一件新的纪念品。");
      } else {
        setMessage("");
      }
      const openId = typeof params.open === "string" ? params.open : null;
      if (openId && !handledOpenRef.current) {
        const target = invitedResult.find((item) => item.giftId === openId);
        if (target?.album) {
          handledOpenRef.current = true;
          router.push(`/gifts/shared/${openId}` as never);
          router.setParams({ open: undefined });
        }
      }
    } catch {
      if (!canCommit()) return;
      setOwned([]);
      setInvited([]);
      setLoadedContextKey(capturedContextKey);
      setMessage("暂时无法读取纪念品，请检查网络后重试。");
    }
  }, [client, params.open, router, session, sessionContextKey]);

  React.useEffect(() => {
    if (!isAuthReady) return;
    let active = true;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    handledOpenRef.current = false;
    void load(generation, () => active);
    return () => { active = false; };
  }, [isAuthReady, load]);
  if (!isAuthReady) return null;
  const visibleOwned = loadedContextKey === sessionContextKey ? owned : [];
  const visibleInvited = loadedContextKey === sessionContextKey ? invited : [];

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.background }}>
      <ScreenTitle title="我的纪念品" caption="MY NFC GIFTS" />

      {message ? <Text selectable style={styles.message}>{message}</Text> : null}

      {visibleOwned.length > 0 ? (
        <Section title="我管理的" caption={`${visibleOwned.length} 件`}>
          {visibleOwned.map((item) => (
            <View key={item.id} style={styles.giftCard}>
              <CoverThumb uri={item.album?.cover?.readUrl} title={item.album?.title ?? "未发布"} />
              <View style={styles.giftInfo}>
                <Text style={styles.giftLabel}>{item.album?.title ?? "我创建的礼物"}</Text>
                <Text style={styles.giftHint}>
                  {item.album ? `版本 ${item.album.version} · 可管理` : "管理相册、邀请成员、发布更新"}
                </Text>
              </View>
              <AppButton
                label="管理"
                onPress={() => router.push(`/gifts/${item.id}${typeof params.memoryId === "string" ? `?memoryId=${encodeURIComponent(params.memoryId)}` : ""}` as never)}
              />
            </View>
          ))}
        </Section>
      ) : null}

      {visibleInvited.length > 0 ? (
        <Section title="分享给我的" caption={`${visibleInvited.length} 件`}>
          {visibleInvited.map((item) => (
            <Pressable
              accessibilityRole="button"
              disabled={!item.album}
              key={item.giftId}
              onPress={() => item.album ? router.push(`/gifts/shared/${item.giftId}` as never) : undefined}
              style={({ pressed }) => [styles.giftCard, item.album && styles.giftCardPressable, pressed && styles.giftCardPressed]}
            >
              <CoverThumb uri={item.album?.cover?.readUrl} title={item.album?.title ?? "未发布"} />
              <View style={styles.giftInfo}>
                <Text style={styles.giftLabel}>{item.album ? item.album.title : "尚未发布相册"}</Text>
                <Text style={styles.giftHint}>
                  {item.album ? `版本 ${item.album.version} · ${item.role === "editor" ? "读写访问" : "只读访问"}` : "拥有者尚未发布共享相册"}
                </Text>
              </View>
              {item.album ? <Text style={styles.viewHint}>查看 ›</Text> : null}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {session ? (
        <AppButton label="刷新" onPress={() => void load()} />
      ) : (
        <AppButton label="登录" onPress={() => router.push("/login?returnTo=/gifts" as never)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, padding: 20, paddingBottom: 40 },
  message: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22 },
  giftCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  giftCardPressable: { backgroundColor: colors.paper },
  giftCardPressed: { opacity: 0.82 },
  coverThumb: { backgroundColor: colors.accentSoft, borderRadius: 6, height: 74, width: 56 },
  coverFallback: { alignItems: "center", justifyContent: "center", padding: 6 },
  coverFallbackText: { color: colors.muted, fontFamily: serifFont, fontSize: 10, fontWeight: "700", textAlign: "center" },
  giftInfo: { flex: 1, gap: 4 },
  giftLabel: { color: colors.ink, fontFamily: serifFont, fontSize: 16, fontWeight: "800" },
  giftHint: { color: colors.muted, fontFamily: bodyFont, fontSize: 12, lineHeight: 18 },
  viewHint: { color: colors.warmAccent, fontFamily: bodyFont, fontSize: 13, fontWeight: "800" },
});
