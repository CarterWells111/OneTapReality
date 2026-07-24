import * as React from "react";
import { ScrollView, Text } from "react-native";

import { AppButton, colors, PaperCard, ScreenTitle } from "../../components/ui";
import { BackendApiClient } from "../../services/backend/api-client";
import { clearGiftSession, loadGiftSession } from "../../services/gifts/gift-credentials";

export default function MyGiftsScreen() {
  const [message, setMessage] = React.useState("正在读取你的纪念品");
  const [items, setItems] = React.useState<{ id: string; status: string; claimedAt: string | null }[]>([]);
  const client = React.useMemo(() => new BackendApiClient(), []);

  const load = React.useCallback(async () => {
    const session = await loadGiftSession();
    if (!session) { setItems([]); setMessage("请先通过任意 NFC 礼品验证邮箱。"); return; }
    try { setItems(await client.listOwnedGifts(session.accessToken)); setMessage("仅显示你作为管理员认领的礼品。"); }
    catch { setItems([]); setMessage("暂时无法读取纪念品，请检查网络或重新验证邮箱。"); }
  }, [client]);

  React.useEffect(() => { void load(); }, [load]);
  return <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }} style={{ backgroundColor: colors.background }}>
    <ScreenTitle title="我的纪念品" caption="MY NFC GIFTS" />
    <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{message}</Text>
    {items.map((item) => <PaperCard key={item.id} tone="paper" style={{ gap: 6 }}><Text selectable style={{ color: colors.ink, fontWeight: "800" }}>已认领礼品</Text><Text selectable style={{ color: colors.muted }}>编号：{item.id}</Text><Text selectable style={{ color: colors.muted }}>请触碰对应礼品以管理相册、访问邮箱和发布更新。</Text></PaperCard>)}
    <AppButton label="刷新" onPress={() => void load()} />
    <AppButton label="退出礼品邮箱" tone="secondary" onPress={() => void clearGiftSession().then(load)} />
  </ScrollView>;
}
