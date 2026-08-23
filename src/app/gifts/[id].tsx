import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { LocalMissingPhotoPlaceholder } from "../../components/local-missing-photo-placeholder";
import { AppButton, bodyFont, colors, PaperCard, ScreenTitle, Section, serifFont } from "../../components/ui";
import { useAuth } from "../../features/auth/auth-provider";
import { useMemories } from "../../features/memories/memories-provider";
import { hasMissingLocalPhotos, MISSING_LOCAL_PHOTO_ACTION_MESSAGE } from "../../features/memories/local-photo-integrity";
import { isMissingPhotoToken } from "../../features/memories/photo-references";
import { BackendApiClient } from "../../services/backend/api-client";
import type { GiftManagementRequest, GiftMemberRole } from "../../services/backend/api-client";
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

type CoverCandidate = { label: string; uri: string };

function isNonOwnerRole(role: GiftMemberRole): role is "viewer" | "editor" {
  return role !== "owner";
}

export default function GiftManagementScreen() {
  const router = useRouter();
  const { id, memoryId } = useLocalSearchParams<{ id: string; memoryId?: string }>();
  const { session } = useAuth();
  const { memories } = useMemories();
  const client = React.useMemo(() => new BackendApiClient(), []);
  const [message, setMessage] = React.useState("正在读取礼品管理信息…");
  const [members, setMembers] = React.useState<{ email: string; role: GiftMemberRole }[]>([]);
  const [album, setAlbum] = React.useState<{ title: string; sourceMemoryId: string; version: number } | null>(null);
  const [managementRequests, setManagementRequests] = React.useState<GiftManagementRequest[]>([]);
  const [selectedMemoryId, setSelectedMemoryId] = React.useState<string | null>(null);
  const [selectedCoverUri, setSelectedCoverUri] = React.useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"viewer" | "editor">("viewer");
  const [busy, setBusy] = React.useState(false);
  const [managementLoaded, setManagementLoaded] = React.useState(false);
  const [authorizedContextKey, setAuthorizedContextKey] = React.useState<string | null>(null);
  const operationInFlight = React.useRef(false);
  const requestGeneration = React.useRef(0);
  const managementContextKey = session && id ? `${id}\u0000${session.user.id}\u0000${session.accessToken}` : null;
  const managementContextKeyRef = React.useRef(managementContextKey);
  managementContextKeyRef.current = managementContextKey;

  const load = React.useCallback(async (generation = requestGeneration.current, isActive: () => boolean = () => true) => {
    if (!session || !id) { router.replace("/login?returnTo=/gifts" as never); return; }
    const canCommit = () => isActive() && requestGeneration.current === generation;
    if (!canCommit()) return;
    setManagementLoaded(false);
    setAuthorizedContextKey(null);
    try {
      const [result, requests] = await Promise.all([client.getOwnedGiftManagement(session.accessToken, id), client.listOwnedGiftManagementRequests(session.accessToken, id)]);
      if (!canCommit()) return;
      const currentEmail = session.user.email.trim().toLowerCase();
      if (!result.members.some((member) => member.role === "owner" && member.email.trim().toLowerCase() === currentEmail)) {
        throw new Error("owner_required");
      }
      setMembers(result.members.map((member) => ({ email: member.email, role: member.role })));
      setAlbum(result.album ? { title: result.album.title, sourceMemoryId: result.album.sourceMemoryId, version: result.album.version } : null);
      setManagementRequests(requests.filter((request) => request.status === "pending"));
      setSelectedMemoryId((current) => current ?? (typeof memoryId === "string" ? memoryId : null) ?? result.album?.sourceMemoryId ?? null);
      setAuthorizedContextKey(managementContextKey);
      setMessage("仅你可管理此礼品。每件礼品最多 3 个访问邮箱（含你）。");
    } catch {
      if (!canCommit()) return;
      setMembers([]);
      setAlbum(null);
      setManagementRequests([]);
      setMessage("无法读取礼品管理信息；请确认登录账户和网络后重试。");
    } finally {
      if (canCommit()) setManagementLoaded(true);
    }
  }, [client, id, managementContextKey, memoryId, router, session]);

  React.useEffect(() => {
    let active = true;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    operationInFlight.current = false;
    setBusy(false);
    void load(generation, () => active);
    return () => { active = false; };
  }, [load]);
  const retryLoad = () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    void load(generation);
  };
  const selectedMemory = memories.find((memory) => memory.id === selectedMemoryId && memory.status !== "discarded");
  const coverCandidates = React.useMemo<CoverCandidate[]>(() => {
    if (!selectedMemory) return [];
    const candidates: CoverCandidate[] = [];
    if (selectedMemory.coverImage) candidates.push({ label: "旅行册封面背景", uri: selectedMemory.coverImage });
    selectedMemory.pages.forEach((page, index) => {
      if (page.photoUri) candidates.push({ label: `第 ${index + 1} 页照片`, uri: page.photoUri });
    });
    return candidates;
  }, [selectedMemory]);

  React.useEffect(() => {
    if (coverCandidates.length === 0) {
      setSelectedCoverUri(null);
      return;
    }
    setSelectedCoverUri((current) => (current && coverCandidates.some((candidate) => candidate.uri === current) ? current : coverCandidates[0].uri));
  }, [coverCandidates]);

  const beginOwnerOperation = () => {
    if (!managementContextKey || authorizedContextKey !== managementContextKey || operationInFlight.current) return null;
    operationInFlight.current = true;
    setBusy(true);
    return { contextKey: managementContextKey, generation: requestGeneration.current };
  };
  const operationIsCurrent = (operation: { contextKey: string; generation: number }) => managementContextKeyRef.current === operation.contextKey && requestGeneration.current === operation.generation;
  const finishOwnerOperation = (operation: { contextKey: string; generation: number }) => {
    if (!operationIsCurrent(operation)) return;
    operationInFlight.current = false;
    setBusy(false);
  };

  const publish = async () => {
    if (!session || !id || !selectedMemory) { setMessage("请选择一册本地旅行册后再发布。"); return; }
    if (hasMissingLocalPhotos(selectedMemory)) {
      setMessage(MISSING_LOCAL_PHOTO_ACTION_MESSAGE);
      return;
    }
    const operation = beginOwnerOperation();
    if (!operation) return;
    try {
      const photoPages = selectedMemory.pages.filter((page) => Boolean(page.photoUri));
      const media = await Promise.all(photoPages.map(async (page, position) => {
        const info = await FileSystem.getInfoAsync(page.photoUri!);
        if (!info.exists || typeof info.size !== "number" || info.size < 1) throw new Error("有照片无法读取，请在本机重新选择后再发布");
        return { position, contentType: imageContentType(page.photoUri!), byteSize: info.size, uri: page.photoUri! };
      }));
      if (!operationIsCurrent(operation)) return;
      let coverSize: number | null = null;
      let coverContentType: string | null = null;
      if (selectedCoverUri) {
        const coverInfo = await FileSystem.getInfoAsync(selectedCoverUri);
        if (!operationIsCurrent(operation)) return;
        if (!coverInfo.exists || typeof coverInfo.size !== "number" || coverInfo.size < 1) {
          throw new Error("封面图片无法读取，请重新选择后再发布");
        }
        coverSize = coverInfo.size;
        coverContentType = imageContentType(selectedCoverUri);
      }
      const publication = await client.startOwnedGiftPublish(session.accessToken, id, {
        baseVersion: album?.version ?? 0,
        sourceMemoryId: selectedMemory.id,
        title: selectedMemory.title,
        pages: selectedMemory.pages.map((page, position) => ({ position, page: sharedPage(page) })),
        media: media.map(({ position, contentType, byteSize }) => ({ position, contentType, byteSize })),
        cover: coverSize && coverContentType ? { contentType: coverContentType, byteSize: coverSize } : null,
      });
      if (!operationIsCurrent(operation)) return;
      for (const upload of publication.uploads) {
        const file = media.find((item) => item.position === upload.position);
        if (!file) throw new Error("上传清单不完整");
        const response = await FileSystem.uploadAsync(upload.uploadUrl, file.uri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": file.contentType },
        });
        if (!operationIsCurrent(operation)) return;
        if (response.status < 200 || response.status >= 300) throw new Error("照片上传失败");
      }
      if (publication.coverUpload && selectedCoverUri) {
        const response = await FileSystem.uploadAsync(publication.coverUpload.uploadUrl, selectedCoverUri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": imageContentType(selectedCoverUri) },
        });
        if (!operationIsCurrent(operation)) return;
        if (response.status < 200 || response.status >= 300) throw new Error("封面上传失败");
      }
      await client.finishOwnedGiftPublish(session.accessToken, id, publication.publicationId);
      if (!operationIsCurrent(operation)) return;
      setMessage("共享相册已发布。日后本机修改不会自动上传，请在此页面手动更新。");
      await load(operation.generation, () => operationIsCurrent(operation));
    } catch (error) { if (operationIsCurrent(operation)) setMessage(error instanceof Error ? error.message : "发布失败，可重试；当前已发布相册不会变化。"); }
    finally { finishOwnerOperation(operation); }
  };

  const invite = async () => {
    if (!session || !id) return;
    const operation = beginOwnerOperation();
    if (!operation) return;
    try { const result = await client.addOwnedGiftMember(session.accessToken, id, inviteEmail, inviteRole); if (!operationIsCurrent(operation)) return; setMembers(result.members); setInviteEmail(""); setMessage("已添加成员；对方需要先用 NFC 礼品完成首次激活。"); }
    catch (error) { if (operationIsCurrent(operation)) setMessage(error instanceof Error ? error.message : "无法添加访问邮箱。"); }
    finally { finishOwnerOperation(operation); }
  };

  const changeRole = async (email: string, currentRole: "viewer" | "editor") => {
    if (!session || !id) return;
    const operation = beginOwnerOperation();
    if (!operation) return;
    const nextRole = currentRole === "viewer" ? "editor" : "viewer";
    try {
      const result = await client.updateOwnedGiftMemberRole(session.accessToken, id, email, nextRole);
      if (!operationIsCurrent(operation)) return;
      setMembers(result.members);
      setMessage(`已将 ${email} 调整为${nextRole === "editor" ? "读写成员" : "只读成员"}。`);
    } catch (error) {
      if (operationIsCurrent(operation)) setMessage(error instanceof Error ? error.message : "无法更新成员权限。");
    } finally {
      finishOwnerOperation(operation);
    }
  };

  const remove = async (email: string) => {
    if (!session || !id) return;
    const operation = beginOwnerOperation();
    if (!operation) return;
    try { await client.removeOwnedGiftMember(session.accessToken, id, email); if (!operationIsCurrent(operation)) return; await load(operation.generation, () => operationIsCurrent(operation)); }
    catch { if (operationIsCurrent(operation)) setMessage("无法移除该访问邮箱。"); }
    finally { finishOwnerOperation(operation); }
  };

  const decideRequest = async (requestId: string, decision: "approved" | "rejected") => {
    if (!session || !id) return; const operation = beginOwnerOperation(); if (!operation) return;
    try { await client.decideOwnedGiftManagementRequest(session.accessToken, id, requestId, decision); if (!operationIsCurrent(operation)) return; await load(operation.generation, () => operationIsCurrent(operation)); if (operationIsCurrent(operation)) setMessage(decision === "approved" ? "申请已批准。" : "申请已拒绝。"); }
    catch (error) { if (operationIsCurrent(operation)) setMessage(error instanceof Error ? error.message : "无法处理该申请，请重试。"); }
    finally { finishOwnerOperation(operation); }
  };

  const disable = () => Alert.alert("永久停用礼品？", "访问名单和共享相册会立即撤销，之后不能重新认领。媒体会在后台安全清理。", [
    { text: "取消", style: "cancel" },
    { text: "永久停用", style: "destructive", onPress: () => void (async () => {
      if (!session || !id) return;
      const operation = beginOwnerOperation();
      if (!operation) return;
      try { await client.disableOwnedGift(session.accessToken, id); if (operationIsCurrent(operation)) router.replace("/gifts" as never); }
      catch { if (operationIsCurrent(operation)) setMessage("停用失败，请重试。"); }
      finally { finishOwnerOperation(operation); }
    })() },
  ]);

  if (!session) return null;

  if (!managementLoaded || authorizedContextKey !== managementContextKey) {
    return <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.background }}>
      <ScreenTitle title="礼品管理" caption="OWNER ONLY" />
      <Text selectable style={styles.message}>{message}</Text>
      {managementLoaded ? <AppButton label="重试" tone="secondary" onPress={retryLoad} /> : null}
      {managementLoaded ? <AppButton label="返回我的礼品" tone="secondary" onPress={() => router.replace("/gifts" as never)} /> : null}
    </ScrollView>;
  }

  return <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.background }}>
    <ScreenTitle title="礼品管理" caption="OWNER ONLY" />
    <Text selectable style={styles.message}>{message}</Text>

    <Section title="待处理申请" caption={`${managementRequests.length} PENDING`}><PaperCard tone="surface" style={{ gap: 10 }}>
      {managementRequests.length === 0 ? <Text style={styles.hint}>暂无待处理申请。</Text> : managementRequests.map((request) => <View key={request.id} style={styles.requestRow}>
        <Text style={styles.memberEmail}>{request.action === "delete_album" ? "删除整册" : request.action === "remove_member" ? "移除成员" : "修改成员权限"}</Text>
        {request.targetEmail ? <Text selectable style={styles.message}>目标：{request.targetEmail}</Text> : null}{request.targetRole ? <Text style={styles.message}>新权限：{request.targetRole === "editor" ? "读写" : "只读"}</Text> : null}
        <Text style={styles.message}>申请时间：{new Date(request.createdAt).toLocaleString("zh-CN")}</Text><View style={styles.requestActions}>{(["approved", "rejected"] as const).map((decision) => { const action = request.action === "delete_album" ? "删除整册" : request.action === "remove_member" ? "移除成员" : "修改成员权限"; const detail = [request.targetEmail, request.targetRole === "editor" ? "读写" : request.targetRole === "viewer" ? "只读" : null].filter(Boolean).join(" "); return <Pressable accessibilityLabel={`${decision === "approved" ? "批准" : "拒绝"}${action}${detail ? ` ${detail}` : ""}`} accessibilityRole="button" disabled={busy} key={decision} onPress={() => void decideRequest(request.id, decision)} style={styles.decisionButton}><Text style={styles.decisionButtonText}>{decision === "approved" ? "批准" : "拒绝"}</Text></Pressable>; })}</View>
      </View>)}
    </PaperCard></Section>

    <Section title="共享相册" caption="SHARED ALBUM">
      <PaperCard tone="surface" style={{ gap: 10 }}>
        <View style={styles.albumStatus}>
          {album ? (
            <>
              <Text style={styles.albumTitle}>{album.title}</Text>
              <Text style={styles.albumMeta}>版本 {album.version}</Text>
            </>
          ) : (
            <Text style={styles.hint}>尚未发布共享相册。选择一册本地旅行册后发布。</Text>
          )}
        </View>
        {album ? (
          <AppButton label="查看当前共享相册" tone="warm" onPress={() => router.push(`/gifts/shared/${encodeURIComponent(id)}?access=owner` as never)} />
        ) : (
          <>
            {coverCandidates.length > 0 ? (
              <View style={styles.coverPicker}>
                <Text style={styles.coverLabel}>选择相册封面</Text>
                <ScrollView contentContainerStyle={styles.coverRow} horizontal showsHorizontalScrollIndicator={false}>
                  {coverCandidates.map((candidate) => {
                    const selected = candidate.uri === selectedCoverUri;
                    return (
                      <Pressable
                        accessibilityLabel={isMissingPhotoToken(candidate.uri) ? `${candidate.label}，本地照片缺失` : candidate.label}
                        accessibilityRole="button"
                        key={candidate.uri}
                        onPress={() => setSelectedCoverUri(candidate.uri)}
                        style={[styles.coverOption, selected && styles.coverOptionSelected]}
                      >
                        {isMissingPhotoToken(candidate.uri)
                          ? <LocalMissingPhotoPlaceholder style={styles.coverThumb} />
                          : <Image contentFit="cover" source={{ uri: candidate.uri }} style={styles.coverThumb} />}
                        <Text numberOfLines={1} style={styles.coverOptionLabel}>{candidate.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            {memories.some((memory) => memory.status !== "discarded") ? memories.filter((memory) => memory.status !== "discarded").map((memory) => (
              <AppButton
                key={memory.id}
                label={selectedMemoryId === memory.id ? `已选择：${memory.title}` : memory.title}
                tone={selectedMemoryId === memory.id ? "warm" : "secondary"}
                onPress={() => setSelectedMemoryId(memory.id)}
              />
            )) : <Text style={styles.hint}>请先返回主页创建本地旅行册，再回来完成首次发布。</Text>}
            <AppButton
              disabled={busy || !selectedMemory}
              label="发布共享相册"
              onPress={() => void publish()}
            />
          </>
        )}
      </PaperCard>
    </Section>

    <Section title="访问成员" caption={`${members.length} / 3`}>
      <PaperCard tone="surface" style={{ gap: 10 }}>
        {members.map((member) => (
          <View key={member.email} style={styles.memberRow}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberEmail}>{member.email}</Text>
              <Text style={styles.memberRole}>{member.role === "owner" ? "拥有者" : member.role === "editor" ? "读写成员" : "只读成员"}</Text>
            </View>
            {isNonOwnerRole(member.role) ? (
              <View style={styles.memberActions}>
                <Pressable
                  accessibilityLabel={`更改 ${member.email} 的权限`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => { if (isNonOwnerRole(member.role)) void changeRole(member.email, member.role); }}
                  style={[styles.roleButton, busy && styles.controlDisabled]}
                >
                  <Text style={styles.roleButtonText}>{member.role === "viewer" ? "改为读写" : "改为只读"}</Text>
                </Pressable>
                <AppButton disabled={busy} label="移除" tone="secondary" onPress={() => void remove(member.email)} />
              </View>
            ) : null}
          </View>
        ))}
        <Text style={styles.activationHint}>只读和读写成员都需要先用 NFC 礼品完成首次激活。</Text>
        {members.length < 3 ? (
          <View style={styles.inviteArea}>
            <View style={styles.rolePicker}>
              {(["viewer", "editor"] as const).map((role) => (
                <Pressable
                  accessibilityLabel={`邀请权限：${role === "viewer" ? "只读" : "读写"}`}
                  accessibilityRole="button"
                  key={role}
                  onPress={() => setInviteRole(role)}
                  style={[styles.roleOption, inviteRole === role && styles.roleOptionSelected]}
                >
                  <Text style={[styles.roleOptionText, inviteRole === role && styles.roleOptionTextSelected]}>{role === "viewer" ? "只读 · 查看相册" : "读写 · 查看与编辑"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.inviteRow}>
            <TextInput
              accessibilityLabel="邀请邮箱"
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setInviteEmail}
              placeholder="邀请成员邮箱"
              placeholderTextColor={colors.muted}
              style={styles.inviteInput}
              value={inviteEmail}
            />
              <AppButton disabled={busy || !inviteEmail.trim()} label="添加成员" onPress={() => void invite()} />
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>已达到最多 3 个访问邮箱。</Text>
        )}
      </PaperCard>
    </Section>

    <AppButton disabled={busy} label="永久停用礼品" tone="danger" onPress={disable} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { gap: 22, padding: 20, paddingBottom: 40 },
  message: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22 },
  albumStatus: { gap: 4 },
  albumTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 18, fontWeight: "800" },
  albumMeta: { color: colors.muted, fontFamily: bodyFont, fontSize: 13 },
  hint: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22, textAlign: "center" },
  coverPicker: { gap: 8 },
  coverLabel: { color: colors.ink, fontFamily: bodyFont, fontSize: 13, fontWeight: "700" },
  coverRow: { gap: 10, paddingVertical: 2 },
  coverOption: { alignItems: "center", borderColor: "transparent", borderRadius: 10, borderWidth: 2, gap: 4, padding: 3, width: 76 },
  coverOptionSelected: { borderColor: colors.warmAccent },
  coverThumb: { backgroundColor: colors.accentSoft, borderRadius: 8, height: 84, width: 64 },
  coverOptionLabel: { color: colors.muted, fontFamily: bodyFont, fontSize: 11, width: 70 },
  memberRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 },
  memberInfo: { flex: 1, gap: 2 },
  memberEmail: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, fontWeight: "600" },
  memberRole: { color: colors.muted, fontFamily: bodyFont, fontSize: 12 },
  memberActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  roleButton: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  roleButtonText: { color: colors.accent, fontFamily: bodyFont, fontSize: 13, fontWeight: "700" },
  controlDisabled: { opacity: 0.45 },
  requestRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6, paddingVertical: 10 },
  requestActions: { flexDirection: "row", gap: 8 },
  decisionButton: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 16, flex: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  decisionButtonText: { color: colors.accent, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  activationHint: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, lineHeight: 20 },
  inviteArea: { gap: 10, paddingTop: 8 },
  rolePicker: { flexDirection: "row", gap: 8 },
  roleOption: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, flex: 1, paddingHorizontal: 10, paddingVertical: 10 },
  roleOptionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  roleOptionText: { color: colors.muted, fontFamily: bodyFont, fontSize: 12, textAlign: "center" },
  roleOptionTextSelected: { color: colors.background, fontWeight: "700" },
  inviteRow: { flexDirection: "row", gap: 10, paddingTop: 8 },
  inviteInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 14,
  },
});
