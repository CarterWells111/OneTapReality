import { useRouter } from "expo-router";
import * as React from "react";
import { Image, ScrollView, Text, View } from "react-native";

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
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [entryStatus, setEntryStatus] = React.useState<string | null>(null);
  const [ownerId, setOwnerId] = React.useState<string | null>(null);

  const loadAccess = React.useCallback(async (accessToken: string, state: string) => {
    if (state === "unclaimed") await client.claimGift(token, accessToken);
    const access = await client.getGiftAccess(token, accessToken);
    if (access.role === "owner") {
      setOwnerId(access.id);
      setStatus(access.albumId ? `这是你管理的礼品，已发布相册“${access.albumTitle}”。` : "这是你管理的礼品；请选择并发布一册本地旅行册。");
      return;
    }
    if (!access.albumId) { setStatus("礼品拥有者尚未发布共享相册。"); return; }
    const album = await client.getGiftAlbum(token, accessToken);
    setPhotos(album.media.map((media) => media.readUrl));
    setStatus(`共享相册：${album.title}`);
  }, [client, token]);

  const refresh = React.useCallback(async () => {
    try {
      const entry = await client.getGiftEntryStatus(token);
      setEntryStatus(entry.status);
      setPhotos([]);
      setOwnerId(null);
      if (entry.status === "disabled") { setStatus("此礼品已永久停用。"); return; }
      if (entry.status === "initializing") { setStatus("此礼品正在初始化，请稍后再试。"); return; }
      if (!session) { setStatus(entry.status === "unclaimed" ? "登录后即可自动认领这件礼品。" : "登录后可查看你是否获邀访问此礼品。"); return; }
      await loadAccess(session.accessToken, entry.status);
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 404) setStatus("此礼品链接无效。");
      else if (error instanceof BackendApiError && error.status === 403) setStatus("你没有访问此礼品的权限。");
      else setStatus("暂时无法读取礼品，请检查网络后重试。");
    }
  }, [client, loadAccess, session, token]);

  React.useEffect(() => { if (isAuthReady) void refresh(); }, [isAuthReady, refresh]);
  const returnTo = `/gift/${encodeURIComponent(token)}`;
  return <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }} style={{ backgroundColor: colors.background }}><PaperCard tone="paper" style={{ gap: 14 }}><ScreenTitle title="NFC 纪念礼品" caption="ONE TAP REALITY" /><Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{status}</Text>{photos.map((uri) => <Image key={uri} source={{ uri }} style={{ borderRadius: 12, height: 240, width: "100%" }} />)}{!session && entryStatus !== "disabled" ? <AppButton label="登录后认领礼品" onPress={() => router.push(`/login?returnTo=${encodeURIComponent(returnTo)}` as never)} /> : null}{ownerId ? <AppButton label="管理礼品" onPress={() => router.push(`/gifts/${ownerId}` as never)} /> : null}<AppButton label="重试" tone="secondary" onPress={() => void refresh()} /></PaperCard></ScrollView>;
}
