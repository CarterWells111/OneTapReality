import { Stack, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import * as React from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";

import { bodyFont, colors } from "../../../../components/ui";
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
  const [cursor, setCursor] = React.useState<Cursor>({ pageId: routePageId ?? "", index: routePageIndex });
  const [dirty, setDirty] = React.useState(false);
  const [status, setStatus] = React.useState("正在读取共享相册最新版…");
  const allowRemove = React.useRef(false);
  const requestGeneration = React.useRef(0);

  const leaveToGiftList = React.useCallback(() => {
    allowRemove.current = true;
    router.replace("/gifts");
  }, [router]);

  const load = React.useCallback(async (nextCursor: Cursor) => {
    const generation = ++requestGeneration.current;
    setAlbum(null);
    setCursor(nextCursor);
    setDirty(false);
    setStatus("正在读取共享相册最新版…");
    if (!session || !id) {
      const editRoute = id ? `/gifts/shared/${encodeURIComponent(id)}/edit` : "/gifts";
      allowRemove.current = true;
      router.replace(`/login?returnTo=${encodeURIComponent(editRoute)}` as never);
      return;
    }
    try {
      const result = access === "owner"
        ? await client.getOwnedGiftAlbum(id, session.accessToken)
        : await client.getInvitedGiftAlbum(id, session.accessToken);
      if (generation !== requestGeneration.current) return;
      if (result.role !== "owner" && result.role !== "editor") {
        leaveToGiftList();
        return;
      }
      setAlbum(result);
      setStatus("");
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      if (error instanceof BackendApiError && error.status === 403) {
        leaveToGiftList();
        return;
      }
      setStatus("无法读取共享相册最新版，请检查网络后重试。");
    }
  }, [access, client, id, leaveToGiftList, router, session]);

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
    if (!id) return;
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
  }, [access, id, router]);

  const handlePublished = React.useCallback(async (result: { cursor: Cursor; intent: "stay" | "exit" }) => {
    if (result.intent === "exit") {
      leaveToPreview(result.cursor);
      return;
    }
    await load(result.cursor);
  }, [leaveToPreview, load]);

  if (!isAuthReady || !session) return null;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "编辑共享相册" }} />
      {status ? <Text selectable style={styles.message}>{status}</Text> : null}
      {album ? (
        <SharedAlbumEditor
          accessToken={session.accessToken}
          album={album}
          fallbackIndex={cursor.index}
          giftId={id}
          initialPageId={cursor.pageId}
          onAccessLost={leaveToGiftList}
          onDirtyChange={setDirty}
          onExit={leaveToPreview}
          onPublished={handlePublished}
          onReload={() => load(cursor)}
        />
      ) : null}
    </ScrollView>
  );
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
