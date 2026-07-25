import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as React from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";

import { AppButton, colors, PaperCard, ScreenTitle } from "../../components/ui";
import { useAuth } from "../../features/auth/auth-provider";
import { useMemories } from "../../features/memories/memories-provider";
import { BackendApiClient } from "../../services/backend/api-client";
import type { Memory } from "../../types/memory";

function imageContentType(uri: string) {
  const lower = uri.split("?")[0].toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

function sharedPage(page: Memory["pages"][number]) {
  const { photoUri: _photoUri, coverImage: _coverImage, ...safePage } = page;
  return safePage;
}

export default function GiftManagementScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { memories } = useMemories();
  const client = React.useMemo(() => new BackendApiClient(), []);
  const [message, setMessage] = React.useState("正在读取礼品管理信息…");
  const [members, setMembers] = React.useState<{ email: string; role: "owner" | "viewer" }[]>([]);
  const [album, setAlbum] = React.useState<{ title: string; sourceMemoryId: string; version: number } | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = React.useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!session || !id) { router.replace("/login?returnTo=/gifts" as never); return; }
    try {
      const result = await client.getOwnedGiftManagement(session.accessToken, id);
      setMembers(result.members.map((member) => ({ email: member.email, role: member.role })));
      setAlbum(result.album ? { title: result.album.title, sourceMemoryId: result.album.sourceMemoryId, version: result.album.version } : null);
      setSelectedMemoryId((current) => current ?? result.album?.sourceMemoryId ?? null);
      setMessage("仅你可管理此礼品。每件礼品最多 3 个访问邮箱（含你）。");
    } catch { setMessage("无法读取礼品管理信息；请确认登录账户和网络后重试。"); }
  }, [client, id, router, session]);

  React.useEffect(() => { void load(); }, [load]);
  const selectedMemory = memories.find((memory) => memory.id === selectedMemoryId && memory.status !== "discarded");

  const publish = async () => {
    if (!session || !id || !selectedMemory) { setMessage("请选择一册本地旅行册后再发布。"); return; }
    setBusy(true);
    try {
      const photoPages = selectedMemory.pages.filter((page) => Boolean(page.photoUri));
      const media = await Promise.all(photoPages.map(async (page, position) => {
        const info = await FileSystem.getInfoAsync(page.photoUri!);
        if (!info.exists || typeof info.size !== "number" || info.size < 1) throw new Error("有照片无法读取，请在本机重新选择后再发布");
        return { position, contentType: imageContentType(page.photoUri!), byteSize: info.size, uri: page.photoUri! };
      }));
      const publication = await client.startOwnedGiftPublish(session.accessToken, id, {
        sourceMemoryId: selectedMemory.id,
        title: selectedMemory.title,
        pages: selectedMemory.pages.map((page, position) => ({ position, page: sharedPage(page) })),
        media: media.map(({ position, contentType, byteSize }) => ({ position, contentType, byteSize })),
      });
      for (const upload of publication.uploads) {
        const file = media.find((item) => item.position === upload.position);
        if (!file) throw new Error("上传清单不完整");
        const response = await FileSystem.uploadAsync(upload.uploadUrl, file.uri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": file.contentType },
        });
        if (response.status < 200 || response.status >= 300) throw new Error("照片上传失败");
      }
      await client.finishOwnedGiftPublish(session.accessToken, id, publication.publicationId);
      setMessage("共享相册已发布。日后本机修改不会自动上传，请在此页面手动更新。");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "发布失败，可重试；当前已发布相册不会变化。"); }
    finally { setBusy(false); }
  };

  const invite = async () => {
    if (!session || !id) return;
    setBusy(true);
    try { const result = await client.addOwnedGiftMember(session.accessToken, id, inviteEmail); setMembers(result.members); setInviteEmail(""); setMessage("已添加访问邮箱。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "无法添加访问邮箱。"); }
    finally { setBusy(false); }
  };

  const remove = async (email: string) => {
    if (!session || !id) return;
    setBusy(true);
    try { await client.removeOwnedGiftMember(session.accessToken, id, email); await load(); }
    catch { setMessage("无法移除该访问邮箱。"); }
    finally { setBusy(false); }
  };

  const disable = () => Alert.alert("永久停用礼品？", "访问名单和共享相册会立即撤销，之后不能重新认领。媒体会在后台安全清理。", [
    { text: "取消", style: "cancel" },
    { text: "永久停用", style: "destructive", onPress: () => void (async () => {
      if (!session || !id) return;
      setBusy(true);
      try { await client.disableOwnedGift(session.accessToken, id); router.replace("/gifts" as never); }
      catch { setMessage("停用失败，请重试。"); }
      finally { setBusy(false); }
    })() },
  ]);

  return <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }} style={{ backgroundColor: colors.background }}>
    <ScreenTitle title="礼品管理" caption="OWNER ONLY" />
    <Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{message}</Text>
    <PaperCard tone="paper" style={{ gap: 10 }}><Text style={{ color: colors.ink, fontWeight: "800" }}>共享相册</Text><Text style={{ color: colors.muted }}>{album ? `当前：${album.title}（版本 ${album.version}）` : "尚未发布共享相册"}</Text><AppButton label="新建本地旅行册" tone="secondary" onPress={() => router.push("/memory/new" as never)} />{memories.filter((memory) => memory.status !== "discarded").map((memory) => <AppButton key={memory.id} label={selectedMemoryId === memory.id ? `已选择：${memory.title}` : memory.title} tone={selectedMemoryId === memory.id ? "warm" : "secondary"} onPress={() => setSelectedMemoryId(memory.id)} />)}<AppButton disabled={busy} label={album ? "更新共享相册" : "发布共享相册"} onPress={() => void publish()} /></PaperCard>
    <PaperCard tone="paper" style={{ gap: 10 }}><Text style={{ color: colors.ink, fontWeight: "800" }}>访问邮箱（最多 3 个，含管理者）</Text>{members.map((member) => <View key={member.email} style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: colors.muted }}>{member.email} · {member.role === "owner" ? "管理者" : "只读"}</Text>{member.role === "viewer" ? <AppButton disabled={busy} label="移除" tone="secondary" onPress={() => void remove(member.email)} /> : null}</View>)}<TextInput accessibilityLabel="邀请邮箱" autoCapitalize="none" keyboardType="email-address" onChangeText={setInviteEmail} placeholder="邀请只读访问邮箱" style={{ borderBottomColor: colors.line, borderBottomWidth: 1, color: colors.ink, padding: 10 }} value={inviteEmail} /><AppButton disabled={busy || members.length >= 3} label="添加访问邮箱" onPress={() => void invite()} /></PaperCard>
    <AppButton disabled={busy} label="永久停用礼品" tone="secondary" onPress={disable} />
  </ScrollView>;
}
