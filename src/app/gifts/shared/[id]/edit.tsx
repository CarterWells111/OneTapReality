import { Stack, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import * as React from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";

import { AppButton, bodyFont, colors } from "../../../../components/ui";
import { useAuth } from "../../../../features/auth/auth-provider";
import { SharedAlbumEditor } from "../../../../features/gifts/shared-album-editor";
import { BackendApiClient, BackendApiError, type InvitedGiftAlbum } from "../../../../services/backend/api-client";

type Cursor = { pageId: string; index: number };

export default function SharedGiftEditScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id, access, pageId, pageIndex } = useLocalSearchParams<{
    id: string;
    access?: string;
    pageId?: string | string[];
    pageIndex?: string | string[];
  }>();
  const { isAuthReady, session } = useAuth();
  const client = React.useMemo(() => new BackendApiClient(), []);
  const routePageId = Array.isArray(pageId) ? pageId[0] : pageId;
  const routePageIndex = parsePageIndex(Array.isArray(pageIndex) ? pageIndex[0] : pageIndex);
  const [album, setAlbum] = React.useState<InvitedGiftAlbum | null>(null);
  const [loadedContextKey, setLoadedContextKey] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<Cursor>({ pageId: routePageId ?? "", index: routePageIndex });
  const [dirty, setDirty] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [status, setStatus] = React.useState("正在读取共享相册最新版…");
  const allowRemove = React.useRef(false);
  const requestGeneration = React.useRef(0);
  const contextKey = session && id
    ? `${id}\u0000${access === "owner" ? "owner" : "invited"}\u0000${session.user.id}\u0000${session.accessToken}`
    : null;
  const contextKeyRef = React.useRef(contextKey);
  contextKeyRef.current = contextKey;
  const loadedContextKeyRef = React.useRef<string | null>(null);

  const leaveToGiftList = React.useCallback((operationContextKey = contextKey) => {
    if (operationContextKey !== contextKeyRef.current) return;
    allowRemove.current = true;
    router.replace("/gifts");
  }, [contextKey, router]);

  const load = React.useCallback(async (nextCursor: Cursor) => {
    const loadContextKey = contextKey;
    if (loadContextKey !== contextKeyRef.current) return;
    const generation = ++requestGeneration.current;
    const current = () => generation === requestGeneration.current && loadContextKey === contextKeyRef.current;
    if (loadedContextKeyRef.current !== loadContextKey) {
      loadedContextKeyRef.current = null;
      setLoadedContextKey(null);
      setAlbum(null);
      setDirty(false);
    }
    setCursor(nextCursor);
    setLoadFailed(false);
    setStatus("正在读取共享相册最新版…");
    if (!session || !id) {
      const editRoute = buildEditReturnRoute({ access, id, pageId: routePageId, pageIndex: routePageIndex });
      allowRemove.current = true;
      router.replace(`/login?returnTo=${encodeURIComponent(editRoute)}` as never);
      return;
    }
    try {
      const result = access === "owner"
        ? await client.getOwnedGiftAlbum(id, session.accessToken)
        : await client.getInvitedGiftAlbum(id, session.accessToken);
      if (!current()) return;
      if (result.role !== "owner" && result.role !== "editor") {
        leaveToGiftList(loadContextKey);
        return;
      }
      setAlbum(result);
      loadedContextKeyRef.current = loadContextKey;
      setLoadedContextKey(loadContextKey);
      setDirty(false);
      setLoadFailed(false);
      setStatus("");
    } catch (error) {
      if (!current()) return;
      if (error instanceof BackendApiError && error.status === 403) {
        leaveToGiftList(loadContextKey);
        return;
      }
      setStatus("无法读取共享相册最新版，请检查网络后重试。");
      setLoadFailed(true);
    }
  }, [access, client, contextKey, id, leaveToGiftList, routePageId, routePageIndex, router, session]);

  React.useEffect(() => {
    if (isAuthReady) void load({ pageId: routePageId ?? "", index: routePageIndex });
    return () => { requestGeneration.current += 1; };
  }, [isAuthReady, load, routePageId, routePageIndex]);

  React.useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (allowRemove.current) {
      allowRemove.current = false;
      return;
    }
    if (!dirty) return;
    event.preventDefault();
    Alert.alert(
      "放弃未发布的修改？",
      "当前共享相册的修改只保存在内存中，离开后无法恢复。",
      [
        { text: "继续编辑", style: "cancel" },
        {
          text: "放弃修改",
          style: "destructive",
          onPress: () => {
            allowRemove.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ],
    );
  }), [dirty, navigation]);

  const leaveToPreview = React.useCallback((nextCursor: Cursor) => {
    if (!id || contextKey !== contextKeyRef.current) return;
    allowRemove.current = true;
    router.dismissTo({
      pathname: "/gifts/shared/[id]",
      params: {
        ...(access === "owner" ? { access: "owner" } : {}),
        id,
        pageId: nextCursor.pageId,
        pageIndex: String(nextCursor.index),
      },
    });
  }, [access, contextKey, id, router]);

  const handlePublished = React.useCallback((result: { cursor: Cursor }) => {
    if (contextKey !== contextKeyRef.current) return;
    leaveToPreview(result.cursor);
  }, [contextKey, leaveToPreview]);
  const handleDirtyChange = React.useCallback((nextDirty: boolean) => {
    if (contextKey === contextKeyRef.current) setDirty(nextDirty);
  }, [contextKey]);
  const handleAccessLost = React.useCallback(() => {
    leaveToGiftList(contextKey);
  }, [contextKey, leaveToGiftList]);

  if (!isAuthReady || !session) return null;
  const visibleAlbum = loadedContextKey === contextKey ? album : null;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "编辑共享相册" }} />
      {status ? <Text selectable style={styles.message}>{status}</Text> : null}
      {loadFailed ? <AppButton label="重试读取最新版" tone="secondary" onPress={() => void load(cursor)} /> : null}
      {visibleAlbum ? (
        <SharedAlbumEditor
          key={`${contextKey}:${visibleAlbum.version}`}
          accessToken={session.accessToken}
          album={visibleAlbum}
          fallbackIndex={cursor.index}
          giftId={id}
          initialPageId={cursor.pageId}
          onAccessLost={handleAccessLost}
          onDirtyChange={handleDirtyChange}
          onExit={leaveToPreview}
          onPublished={handlePublished}
          onReload={load}
        />
      ) : null}
    </ScrollView>
  );
}

function buildEditReturnRoute(input: { access?: string; id?: string; pageId?: string; pageIndex: number }) {
  if (!input.id) return "/gifts";
  const query = [
    input.access === "owner" ? "access=owner" : null,
    input.pageId ? `pageId=${encodeURIComponent(input.pageId)}` : null,
    `pageIndex=${input.pageIndex}`,
  ].filter((value): value is string => Boolean(value)).join("&");
  return `/gifts/shared/${encodeURIComponent(input.id)}/edit?${query}`;
}

function parsePageIndex(value?: string) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 20, paddingBottom: 40 },
  message: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22 },
});
