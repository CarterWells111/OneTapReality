import { useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, Text } from "react-native";

import { AppButton, colors, PaperCard, ScreenTitle } from "../../components/ui";
import { useAuth } from "../../features/auth/auth-provider";
import { BackendApiClient } from "../../services/backend/api-client";

export default function MyGiftsScreen() {
  const router = useRouter();
  const { isAuthReady, session, signOut } = useAuth();
  const [message, setMessage] = React.useState("正在读取你的纪念品…");
  const [items, setItems] = React.useState<{ id: string; status: string; claimedAt: string | null }[]>([]);
  const client = React.useMemo(() => new BackendApiClient(), []);
  const load = React.useCallback(async () => {
    if (!session) { setItems([]); setMessage("登录后可查看你作为管理者认领的 NFC 礼品。"); return; }
    try { setItems(await client.listOwnedGifts(session.accessToken)); setMessage("这里只显示当前账户作为管理者拥有的礼品；不会显示 NFC 链接。 "); }
    catch { setItems([]); setMessage("暂时无法读取纪念品，请检查网络后重试。"); }
  }, [client, session]);
  React.useEffect(() => { if (isAuthReady) void load(); }, [isAuthReady, load]);
  if (!isAuthReady) return null;
  return <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }} style={{ backgroundColor: colors.background }}>
    <ScreenTitle title="我的纪念品" caption="MY NFC GIFTS" />
    <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{message}</Text>
    {items.map((item) => <PaperCard key={item.id} tone="paper" style={{ gap: 8 }}><Text selectable style={{ color: colors.ink, fontWeight: "800" }}>已认领礼品</Text><Text selectable style={{ color: colors.muted }}>可管理相册、访问邮箱和手动发布更新。</Text><AppButton label="管理礼品" onPress={() => router.push(`/gifts/${item.id}` as never)} /></PaperCard>)}
    {session ? <><AppButton label="刷新" onPress={() => void load()} /><AppButton label="退出登录" tone="secondary" onPress={() => void signOut()} /></> : <AppButton label="登录" onPress={() => router.push("/login?returnTo=/gifts" as never)} />}
  </ScrollView>;
}
