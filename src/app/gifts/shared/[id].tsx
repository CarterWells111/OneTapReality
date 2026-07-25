import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, bodyFont, colors, PaperCard, ScreenTitle, Section, serifFont } from "../../../components/ui";
import { useAuth } from "../../../features/auth/auth-provider";
import { BackendApiClient, type InvitedGiftAlbum } from "../../../services/backend/api-client";

export default function SharedGiftDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthReady, session } = useAuth();
  const client = React.useMemo(() => new BackendApiClient(), []);
  const [status, setStatus] = React.useState("正在读取分享相册…");
  const [album, setAlbum] = React.useState<InvitedGiftAlbum | null>(null);
  const [photos, setPhotos] = React.useState<string[]>([]);

  const load = React.useCallback(async () => {
    if (!session || !id) {
      router.replace("/login?returnTo=/gifts" as never);
      return;
    }
    try {
      const result = await client.getInvitedGiftAlbum(id, session.accessToken);
      setAlbum(result);
      setPhotos(result.media.map((m) => m.readUrl));
      setStatus("");
    } catch {
      setStatus("无法读取此分享相册，请检查网络后重试。");
    }
  }, [client, id, router, session]);

  React.useEffect(() => { if (isAuthReady) void load(); }, [isAuthReady, load]);
  if (!isAuthReady || !session) return null;

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.background }}>
      <ScreenTitle title={album?.title ?? "分享相册"} caption="SHARED WITH YOU" />

      {status ? <Text selectable style={styles.message}>{status}</Text> : null}

      {album ? (
        <>
          <Section title="相册信息" caption="ALBUM INFO">
            <PaperCard tone="surface" style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>标题</Text>
                <Text style={styles.infoValue}>{album.title}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>版本</Text>
                <Text style={styles.infoValue}>{album.version}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>页数</Text>
                <Text style={styles.infoValue}>{album.pages.length} 页</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>发布</Text>
                <Text style={styles.infoValue}>
                  {new Date(album.publishedAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
                </Text>
              </View>
            </PaperCard>
          </Section>

          {photos.length > 0 ? (
            <Section title="相册照片" caption={`${photos.length} 张`}>
              {photos.map((uri, index) => (
                <Image
                  key={uri || index}
                  source={{ uri }}
                  style={styles.photo}
                  accessibilityLabel={`相册照片 ${index + 1}`}
                />
              ))}
            </Section>
          ) : (
            <Text style={styles.emptyHint}>此相册暂无照片。</Text>
          )}

          {album.pages.length > 0 ? (
            <Section title="页面预览" caption={`${album.pages.length} 页`}>
              {album.pages.map((item) => {
                const page = item.page as Record<string, unknown>;
                return (
                  <PaperCard key={item.position} tone="surface" style={styles.pageCard}>
                    <Text style={styles.pageKind}>
                      {String(page.kind === "cover" ? "封面" : page.kind === "closing" ? "封底" : "照片页")}
                    </Text>
                    {page.headline ? <Text style={styles.pageHeadline}>{String(page.headline)}</Text> : null}
                    {page.body ? <Text style={styles.pageBody}>{String(page.body)}</Text> : null}
                  </PaperCard>
                );
              })}
            </Section>
          ) : null}
        </>
      ) : null}

      <View style={styles.actions}>
        <AppButton label="返回纪念品" onPress={() => router.back()} />
        <AppButton label="刷新" tone="secondary" onPress={() => void load()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, padding: 20, paddingBottom: 40 },
  message: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22 },
  emptyHint: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22, textAlign: "center", paddingVertical: 16 },
  infoCard: { gap: 10 },
  infoRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  infoLabel: { color: colors.muted, fontFamily: bodyFont, fontSize: 13 },
  infoValue: { color: colors.ink, fontFamily: serifFont, fontSize: 15, fontWeight: "600" },
  photo: { borderRadius: 12, height: 240, width: "100%" },
  pageCard: { gap: 6 },
  pageKind: { color: colors.warmAccent, fontFamily: bodyFont, fontSize: 12, fontWeight: "700" },
  pageHeadline: { color: colors.ink, fontFamily: serifFont, fontSize: 17, fontWeight: "800" },
  pageBody: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 21 },
  actions: { gap: 10, paddingTop: 8 },
});
