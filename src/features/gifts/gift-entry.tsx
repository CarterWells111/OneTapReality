import * as React from "react";
import { Image, ScrollView, Text, TextInput, View } from "react-native";

import { AppButton, colors, PaperCard, ScreenTitle } from "../../components/ui";
import { BackendApiClient } from "../../services/backend/api-client";
import { useAuth } from "../auth/auth-provider";

const copy = {
  appOnly: "\u8bf7\u5728 App \u4e2d\u6253\u5f00\u793c\u54c1",
  appOnlyBody: "\u6b64 NFC \u793c\u54c1\u9700\u8981\u5728 App \u4e2d\u5b8c\u6210\u90ae\u7bb1\u9a8c\u8bc1\u3001\u7ed1\u5b9a\u6216\u67e5\u770b\u5171\u4eab\u76f8\u518c\u3002",
  verifyToClaim: "\u9a8c\u8bc1\u90ae\u7bb1\u540e\u5373\u53ef\u8ba4\u9886",
  sendCode: "\u53d1\u9001\u9a8c\u8bc1\u7801",
  continue: "\u9a8c\u8bc1\u5e76\u7ee7\u7eed",
};

export function GiftEntry({ token, platform }: { token: string; platform: "web" | "native" }) {
  if (platform === "web") return <View style={{ flex: 1, justifyContent: "center", padding: 20 }}><PaperCard tone="paper" style={{ gap: 12 }}><ScreenTitle title={copy.appOnly} caption="ONE TAP REALITY" /><Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{copy.appOnlyBody}</Text></PaperCard></View>;
  return <NativeGiftEntry token={token} />;
}

function NativeGiftEntry({ token }: { token: string }) {
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [status, setStatus] = React.useState(copy.verifyToClaim);
  const [photos, setPhotos] = React.useState<string[]>([]);
  const client = React.useMemo(() => new BackendApiClient(), []);
  const { isAuthReady, session, requestCode: requestAccountCode, verifyCode: verifyAccountCode } = useAuth();

  const openExistingGift = React.useCallback(async (accessToken: string) => {
    const access = await client.getGiftAccess(token, accessToken);
    if (access.role === "owner") {
      setStatus(access.albumId ? `\u8fd9\u662f\u4f60\u7ba1\u7406\u7684\u793c\u54c1\uff0c\u76f8\u518c\u201c${access.albumTitle}\u201d\u5df2\u53d1\u5e03\u3002` : "\u8fd9\u662f\u4f60\u7ba1\u7406\u7684\u793c\u54c1\uff1b\u8bf7\u5728\u6211\u7684\u7eaa\u5ff5\u54c1\u4e2d\u7ed1\u5b9a\u76f8\u518c\u3002");
      return;
    }
    if (!access.albumId) { setStatus("\u793c\u54c1\u7ba1\u7406\u5458\u5c1a\u672a\u53d1\u5e03\u5171\u4eab\u76f8\u518c\u3002"); return; }
    const album = await client.getGiftAlbum(token, accessToken);
    setPhotos(album.media.map((media) => media.readUrl));
    setStatus(`\u5171\u4eab\u76f8\u518c\uff1a${album.title}`);
  }, [client, token]);

  React.useEffect(() => {
    let active = true;
    if (!isAuthReady || !session) return;
    void openExistingGift(session.accessToken).catch(() => { if (active) setStatus("\u8bf7\u9a8c\u8bc1\u90ae\u7bb1\u540e\u8bbf\u95ee\u6b64\u793c\u54c1\u3002"); });
    return () => { active = false; };
  }, [isAuthReady, openExistingGift, session]);

  const requestCode = async () => {
    try { const result = await requestAccountCode(email); setEmail(result.email); setSent(true); setStatus("\u9a8c\u8bc1\u7801\u5df2\u53d1\u9001\uff0c\u8bf7\u67e5\u6536\u90ae\u7bb1\u3002"); }
    catch { setStatus("\u6682\u65f6\u65e0\u6cd5\u53d1\u9001\u9a8c\u8bc1\u7801\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002"); }
  };
  const verify = async () => {
    try {
      const verified = await verifyAccountCode(email, code);
      try { await client.claimGift(token, verified.accessToken); } catch { /* Previously claimed gifts continue through the access check. */ }
      await openExistingGift(verified.accessToken);
    } catch (error) { setStatus(error instanceof Error && error.message ? error.message : "\u9a8c\u8bc1\u5931\u8d25\u6216\u7f51\u7edc\u6682\u4e0d\u53ef\u7528\u3002"); }
  };

  return <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }} style={{ backgroundColor: colors.background }}><PaperCard tone="paper" style={{ gap: 14 }}><ScreenTitle title="NFC \u7eaa\u5ff5\u793c\u54c1" caption="ONE TAP REALITY" /><Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{status}</Text>{photos.map((uri) => <Image key={uri} source={{ uri }} style={{ borderRadius: 12, height: 240, width: "100%" }} />)}<TextInput accessibilityLabel="\u90ae\u7bb1" autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} placeholder="\u4f60\u7684\u90ae\u7bb1" style={{ borderBottomColor: colors.line, borderBottomWidth: 1, color: colors.ink, padding: 10 }} value={email} />{sent ? <><TextInput accessibilityLabel="\u9a8c\u8bc1\u7801" keyboardType="number-pad" maxLength={6} onChangeText={setCode} placeholder="6 \u4f4d\u9a8c\u8bc1\u7801" style={{ borderBottomColor: colors.line, borderBottomWidth: 1, color: colors.ink, padding: 10 }} value={code} /><AppButton label={copy.continue} onPress={() => void verify()} /></> : <AppButton label={copy.sendCode} onPress={() => void requestCode()} />}<Text selectable style={{ color: colors.muted, fontSize: 13 }}>\u793c\u54c1\u7f16\u53f7\uff1a{token.slice(0, 8)}\u2026</Text></PaperCard></ScrollView>;
}
