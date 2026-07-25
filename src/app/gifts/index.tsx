import { useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, bodyFont, colors, PaperCard, ScreenTitle, Section, serifFont } from "../../components/ui";
import { useAuth } from "../../features/auth/auth-provider";
import { BackendApiClient, type InvitedGift } from "../../services/backend/api-client";

export default function MyGiftsScreen() {
  const router = useRouter();
  const { isAuthReady, session } = useAuth();
  const [message, setMessage] = React.useState("正在读取你的纪念品…");
  const [owned, setOwned] = React.useState<{ id: string; status: string; claimedAt: string | null }[]>([]);
  const [invited, setInvited] = React.useState<InvitedGift[]>([]);
  const client = React.useMemo(() => new BackendApiClient(), []);

  const load = React.useCallback(async () => {
    if (!session) {
      setOwned([]);
      setInvited([]);
      setMessage("登录后可查看你管理和获赠的 NFC 纪念品。");
      return;
    }
    try {
      const [ownedResult, invitedResult] = await Promise.all([
        client.listOwnedGifts(session.accessToken),
        client.listInvitedGifts(session.accessToken),
      ]);
      setOwned(ownedResult);
      setInvited(invitedResult);
      if (!ownedResult.length && !invitedResult.length) {
        setMessage("你还没有任何 NFC 纪念品。触碰 NFC 标签即可绑定一件新的纪念品。");
      } else {
        setMessage("");
      }
    } catch {
      setOwned([]);
      setInvited([]);
      setMessage("暂时无法读取纪念品，请检查网络后重试。");
    }
  }, [client, session]);

  React.useEffect(() => { if (isAuthReady) void load(); }, [isAuthReady, load]);
  if (!isAuthReady) return null;

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.background }}>
      <ScreenTitle title="我的纪念品" caption="MY NFC GIFTS" />

      {message ? <Text selectable style={styles.message}>{message}</Text> : null}

      {owned.length > 0 ? (
        <Section title="我管理的" caption={`${owned.length} 件`}>
          {owned.map((item) => (
            <PaperCard key={item.id} tone="paper" style={styles.giftCard}>
              <View style={styles.giftInfo}>
                <Text style={styles.giftLabel}>我创建的礼品</Text>
                <Text style={styles.giftHint}>管理相册、邀请成员、发布更新</Text>
              </View>
              <AppButton label="管理" onPress={() => router.push(`/gifts/${item.id}` as never)} />
            </PaperCard>
          ))}
        </Section>
      ) : null}

      {invited.length > 0 ? (
        <Section title="分享给我的" caption={`${invited.length} 件`}>
          {invited.map((item) => (
            <PaperCard key={item.giftId} tone="paper" style={styles.giftCard}>
              <View style={styles.giftInfo}>
                <Text style={styles.giftLabel}>
                  {item.album ? item.album.title : "尚未发布相册"}
                </Text>
                <Text style={styles.giftHint}>
                  {item.album
                    ? `版本 ${item.album.version} · 只读访问`
                    : "拥有者尚未发布共享相册"}
                </Text>
              </View>
              {item.album ? (
                <AppButton
                  label="查看"
                  tone="warm"
                  onPress={() => router.push(`/gifts/shared/${item.giftId}` as never)}
                />
              ) : null}
            </PaperCard>
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
  giftCard: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  giftInfo: { flex: 1, gap: 4 },
  giftLabel: { color: colors.ink, fontFamily: serifFont, fontSize: 16, fontWeight: "800" },
  giftHint: { color: colors.muted, fontFamily: bodyFont, fontSize: 12, lineHeight: 18 },
});
