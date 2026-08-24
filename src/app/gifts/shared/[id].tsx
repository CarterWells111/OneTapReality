import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconButton } from "../../../components/icon-button";
import { AppButton, bodyFont, colors, PaperCard, ScreenTitle, Section, serifFont } from "../../../components/ui";
import { PageReader } from "../../../features/canvas/page-reader";
import { useAuth } from "../../../features/auth/auth-provider";
import { mapSharedAlbumToStoryPages } from "../../../features/gifts/shared-album-mapper";
import { BackendApiClient, type InvitedGiftAlbum } from "../../../services/backend/api-client";
import { toUserFacingBackendError } from "../../../services/backend/user-facing-error";

export default function SharedGiftDetailScreen() {
  const router = useRouter();
  const { id, access, pageId, pageIndex } = useLocalSearchParams<{
    id: string;
    access?: string;
    pageId?: string | string[];
    pageIndex?: string | string[];
  }>();
  const { isAuthReady, session } = useAuth();
  const client = React.useMemo(() => new BackendApiClient(), []);
  const [status, setStatus] = React.useState("正在读取分享相册…");
  const [album, setAlbum] = React.useState<InvitedGiftAlbum | null>(null);
  const [opened, setOpened] = React.useState(false);
  const [readerCursor, setReaderCursor] = React.useState<{ pageId: string; index: number } | null>(null);
  const [targets, setTargets] = React.useState<{ email: string; role: "viewer" | "editor" }[]>([]);
  const [requestBusy, setRequestBusy] = React.useState(false);
  const [requestMessage, setRequestMessage] = React.useState("");
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [loadedContextKey, setLoadedContextKey] = React.useState<string | null>(null);
  const requestInFlight = React.useRef(false);
  const requestGeneration = React.useRef(0);
  const contextKey = session && id ? `${id}\u0000${access === "owner" ? "owner" : "invited"}\u0000${session.user.id}\u0000${session.accessToken}` : null;
  const contextKeyRef = React.useRef(contextKey);
  contextKeyRef.current = contextKey;

  const load = React.useCallback(async () => {
    const loadContextKey = contextKey;
    if (loadContextKey !== contextKeyRef.current) return;
    const generation = ++requestGeneration.current;
    const current = () => generation === requestGeneration.current && loadContextKey === contextKeyRef.current;
    setAlbum(null);
    setOpened(false);
    setReaderCursor(null);
    setTargets([]);
    setRequestMessage("");
    setLoadedContextKey(null);
    requestInFlight.current = false;
    setRequestBusy(false);
    setStatus("正在读取分享相册…");
    setLoadFailed(false);
    if (!session || !id) {
      const sharedRoute = id ? `/gifts/shared/${encodeURIComponent(id)}` : "/gifts";
      router.replace(`/login?returnTo=${encodeURIComponent(sharedRoute)}` as never);
      return;
    }
    try {
      const result = access === "owner"
        ? await client.getOwnedGiftAlbum(id, session.accessToken)
        : await client.getInvitedGiftAlbum(id, session.accessToken);
      if (!current()) return;
      let nextTargets: { email: string; role: "viewer" | "editor" }[] = [];
      if (result.role === "editor") {
        nextTargets = await client.listInvitedGiftManagementTargets(id, session.accessToken);
        if (!current()) return;
      }
      setAlbum(result);
      setTargets(nextTargets);
      setLoadedContextKey(loadContextKey);
      setStatus("");
    } catch {
      if (!current()) return;
      setStatus("无法读取此分享相册，请检查网络后重试。");
      setLoadFailed(true);
    }
  }, [access, client, contextKey, id, router, session]);
  useFocusEffect(React.useCallback(() => {
    if (isAuthReady) void load();
    return () => { requestGeneration.current += 1; };
  }, [isAuthReady, load]));
  if (!isAuthReady || !session) return null;

  const visibleAlbum = loadedContextKey === contextKey ? album : null;
  const coverImage = visibleAlbum?.cover?.readUrl ?? null;
  const canEdit = visibleAlbum?.role === "owner" || visibleAlbum?.role === "editor";
  const pages = visibleAlbum ? mapSharedAlbumToStoryPages(visibleAlbum) : [];
  const requestedPageId = Array.isArray(pageId) ? pageId[0] : pageId;
  const requestedPageIndex = parsePageIndex(Array.isArray(pageIndex) ? pageIndex[0] : pageIndex);
  const fallbackPage = pages[requestedPageIndex] ?? pages[0];
  const openEditor = () => {
    if (!id || !canEdit) return;
    const cursor = readerCursor ?? { pageId: requestedPageId ?? fallbackPage?.id ?? "", index: requestedPageIndex };
    router.push({
      pathname: "/gifts/shared/[id]/edit",
      params: {
        ...(access === "owner" ? { access: "owner" } : {}),
        id,
        pageId: cursor.pageId,
        pageIndex: String(cursor.index),
      },
    });
  };
  const headerRight = canEdit
    ? () => <IconButton accessibilityLabel="编辑共享相册" icon="edit" onPress={openEditor} />
    : undefined;
  const requestManagement = async (input: { action: "delete_album" | "remove_member" | "change_member_role"; targetEmail?: string; targetRole?: "viewer" | "editor" }) => {
    if (!session || !id || !contextKey || loadedContextKey !== contextKey || requestInFlight.current) return;
    const generation = requestGeneration.current;
    const operationContextKey = contextKey;
    requestInFlight.current = true;
    setRequestBusy(true); setRequestMessage("");
    const current = () => generation === requestGeneration.current && operationContextKey === contextKeyRef.current;
    try { await client.createInvitedGiftManagementRequest(id, session.accessToken, input); if (current()) setRequestMessage("申请已提交，等待拥有者处理。"); }
    catch (error) { if (current()) setRequestMessage(toUserFacingBackendError(error, "申请提交失败，请刷新后重试。")); }
    finally { if (current()) { requestInFlight.current = false; setRequestBusy(false); } }
  };

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.background }}>
      <ScreenTitle title={visibleAlbum?.title ?? "分享相册"} caption="SHARED WITH YOU" />
      {visibleAlbum ? <Text selectable style={styles.publishedMeta}>旅行日期 · {visibleAlbum.travelDate ?? "未设置旅行日期"}</Text> : null}

      {status ? <Text selectable style={styles.message}>{status}</Text> : null}
      {loadFailed && session && id ? <AppButton label="重试" tone="secondary" onPress={() => void load()} /> : null}
      {loadedContextKey === contextKey && album?.role === "editor" ? <Section title="管理申请" caption="需要礼品拥有者批准"><PaperCard tone="surface" style={{ gap: 10 }}>
        <Text style={styles.message}>这些操作需要拥有者批准后才会生效。</Text>{requestMessage ? <Text selectable style={styles.message}>{requestMessage}</Text> : null}
        <AppButton disabled={requestBusy} label="申请删除整册" tone="danger" onPress={() => void requestManagement({ action: "delete_album" })} />
        {targets.map((target) => <View key={target.email} style={styles.targetRow}><Text style={styles.targetEmail}>{target.email}</Text><Text style={styles.message}>{target.role === "editor" ? "读写成员" : "只读成员"}</Text>
          <Pressable accessibilityLabel={`申请将 ${target.email} 改为${target.role === "viewer" ? "读写" : "只读"}`} accessibilityRole="button" disabled={requestBusy} onPress={() => void requestManagement({ action: "change_member_role", targetEmail: target.email, targetRole: target.role === "viewer" ? "editor" : "viewer" })} style={styles.managementButton}><Text style={styles.managementButtonText}>{target.role === "viewer" ? "申请改为读写" : "申请改为只读"}</Text></Pressable>
          <Pressable accessibilityLabel={`申请移除成员 ${target.email}`} accessibilityRole="button" disabled={requestBusy} onPress={() => void requestManagement({ action: "remove_member", targetEmail: target.email })} style={styles.managementButton}><Text style={styles.managementButtonText}>申请移除</Text></Pressable>
        </View>)}
      </PaperCard></Section> : null}


      {visibleAlbum ? (
        opened || canEdit ? (
          <>
            <PageReader
              fallbackIndex={readerCursor?.index ?? requestedPageIndex}
              initialPageId={readerCursor?.pageId ?? requestedPageId}
              onActivePageChange={setReaderCursor}
              pages={pages}
            />
            <View style={styles.actions}>
              <AppButton label="返回纪念品" onPress={() => router.back()} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.coverStage}>
              {coverImage ? (
                <Image contentFit="cover" source={{ uri: coverImage }} style={styles.coverImage} testID="album-cover-image" />
              ) : (
                <View style={[styles.coverImage, styles.coverFallback]}>
                  <Text selectable style={styles.coverFallbackTitle}>{visibleAlbum.title}</Text>
                </View>
              )}
            </View>
            <Text selectable style={styles.coverMeta}>
              版本 {visibleAlbum.version} · {new Date(visibleAlbum.publishedAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
            </Text>
            <View style={styles.actions}>
              <AppButton label="打开相册" onPress={() => setOpened(true)} />
              <AppButton label="返回纪念品" tone="secondary" onPress={() => router.back()} />
            </View>
          </>
        )
      ) : null}
      </ScrollView>
    </>
  );
}

function parsePageIndex(value?: string) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  content: { gap: 22, padding: 20, paddingBottom: 40 },
  message: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22 },
  publishedMeta: { color: colors.muted, fontFamily: bodyFont, fontSize: 13 },
  coverStage: { alignItems: "center" },
  coverImage: {
    alignSelf: "center",
    backgroundColor: colors.paper,
    borderColor: colors.paperEdge,
    borderRadius: 12,
    borderWidth: 1,
    height: 346,
    width: 260,
  },
  coverFallback: { alignItems: "center", justifyContent: "center", padding: 24 },
  coverFallbackTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 22, fontWeight: "800", lineHeight: 30, textAlign: "center" },
  coverMeta: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, textAlign: "center" },
  actions: { gap: 10, paddingTop: 8 },
  targetRow: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingTop: 10 },
  targetEmail: { color: colors.ink, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
  managementButton: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 16, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  managementButtonText: { color: colors.accent, fontFamily: bodyFont, fontSize: 14, fontWeight: "700" },
});
