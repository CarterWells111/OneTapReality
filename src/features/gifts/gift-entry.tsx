import { useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, Text, View } from "react-native";

import { AppButton, colors, PaperCard, ScreenTitle } from "../../components/ui";
import { BackendApiClient, BackendApiError } from "../../services/backend/api-client";
import { useAuth } from "../auth/auth-provider";

export function GiftEntry({ token, platform }: { token: string; platform: "web" | "native" }) {
  if (platform === "web") return <View style={{ flex: 1, justifyContent: "center", padding: 20 }}><PaperCard tone="paper" style={{ gap: 12 }}><ScreenTitle title="请在 App 中打开礼品" caption="ONE TAP REALITY" /><Text selectable style={{ color: colors.muted, lineHeight: 22 }}>此 NFC 礼品需要在 App 中完成邮箱验证、认领或查看共享相册。</Text></PaperCard></View>;
  return <NativeGiftEntry token={token} />;
}

function NativeGiftEntry({ token }: { token: string }) {
  const router = useRouter();
  const client = React.useMemo(() => new BackendApiClient(), []);
  const { isAuthReady, session } = useAuth();
  const [status, setStatus] = React.useState("正在检查礼品状态…");
  const [entryStatus, setEntryStatus] = React.useState<string | null>(null);
  const [ownerId, setOwnerId] = React.useState<string | null>(null);
  const [showBindingPrompt, setShowBindingPrompt] = React.useState(false);
  const [isClaiming, setIsClaiming] = React.useState(false);

  const performClaim = React.useCallback(async () => {
    if (!session) return;
    setIsClaiming(true);
    try {
      await client.claimGift(token, session.accessToken);
      setShowBindingPrompt(false);
      const access = await client.getGiftAccess(token, session.accessToken);
      setOwnerId(access.id);
      setStatus(access.albumId
        ? `绑定成功！这是你的礼品，已发布相册"${access.albumTitle}"。`
        : "绑定成功！这是你的礼品；请选择并发布一册本地旅行册。");
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 404) {
        setStatus("此礼品已被他人认领，无法绑定。");
        setShowBindingPrompt(false);
      } else {
        setStatus("绑定失败，请检查网络后重试。");
      }
    } finally { setIsClaiming(false); }
  }, [client, session, token]);

  const loadAccess = React.useCallback(async (accessToken: string, state: string) => {
    if (state === "unclaimed") {
      setShowBindingPrompt(true);
      return;
    }
    const access = await client.getGiftAccess(token, accessToken);
    if (access.role === "owner") {
      setOwnerId(access.id);
      setStatus(access.albumId ? `这是你管理的礼品，已发布相册"${access.albumTitle}"。` : "这是你管理的礼品；请选择并发布一册本地旅行册。");
      return;
    }
    const activation = await client.activateGiftViewer(token, accessToken);
    if (!activation.albumPublished) { setStatus("礼品拥有者尚未发布共享相册。"); return; }
    router.replace(`/gifts/shared/${encodeURIComponent(activation.giftId)}` as never);
  }, [client, router, token]);

  const refresh = React.useCallback(async () => {
    try {
      const entry = await client.getGiftEntryStatus(token);
      setEntryStatus(entry.status);
      setOwnerId(null);
      setShowBindingPrompt(false);
      if (entry.status === "disabled") { setStatus("此礼品已永久停用。"); return; }
      if (entry.status === "initializing") { setStatus("此礼品正在初始化，请稍后再试。"); return; }
      if (!session) { setStatus(entry.status === "unclaimed" ? "触碰此 NFC 纪念品即可绑定到你的账户，请先登录。" : "登录后可查看你是否获邀访问此礼品。"); return; }
      await loadAccess(session.accessToken, entry.status);
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 404) setStatus("此礼品链接无效。");
      else if (error instanceof BackendApiError && error.status === 403) setStatus("你没有访问此礼品的权限。");
      else setStatus("暂时无法读取礼品，请检查网络后重试。");
    }
  }, [client, loadAccess, session, token]);

  React.useEffect(() => { if (isAuthReady) void refresh(); }, [isAuthReady, refresh]);
  const returnTo = `/gift/${encodeURIComponent(token)}`;
  return <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }} style={{ backgroundColor: colors.background }}>
    <PaperCard tone="paper" style={{ gap: 14 }}>
      <ScreenTitle title="NFC 纪念礼品" caption="ONE TAP REALITY" />
      <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{status}</Text>
      {showBindingPrompt && session ? (
        <PaperCard tone="surface" style={{ gap: 10 }}>
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}>确认绑定此纪念品</Text>
          <Text style={{ color: colors.muted, lineHeight: 22 }}>绑定后你将作为管理者拥有此纪念品。你可以邀请最多 2 位朋友一同查看，并发布一册旅行册作为共享内容。</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><AppButton label="取消" tone="secondary" onPress={() => { setShowBindingPrompt(false); setStatus("你可以随时重新触碰此 NFC 标签来绑定它。"); }} /></View>
            <View style={{ flex: 1 }}><AppButton disabled={isClaiming} label={isClaiming ? "绑定中…" : "确认绑定"} onPress={() => void performClaim()} /></View>
          </View>
        </PaperCard>
      ) : null}
      {!session && (entryStatus === "unclaimed" || entryStatus === "bound") ? (
        <AppButton
          label={entryStatus === "unclaimed" ? "登录后绑定此纪念品" : "登录后查看此纪念品"}
          onPress={() => router.push(`/login?returnTo=${encodeURIComponent(returnTo)}` as never)}
        />
      ) : null}
      {ownerId ? <AppButton label="管理礼品" onPress={() => router.push(`/gifts/${ownerId}` as never)} /> : null}
      {!showBindingPrompt ? <AppButton label="重试" tone="secondary" onPress={() => void refresh()} /> : null}
    </PaperCard>
  </ScrollView>;
}
