import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, Text, TextInput } from "react-native";

import { AppButton, colors, PaperCard, ScreenTitle } from "../components/ui";
import { useAuth } from "../features/auth/auth-provider";

function safeReturnTo(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path?.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { requestCode, verifyCode } = useAuth();
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [message, setMessage] = React.useState("使用邮箱验证码登录；首次验证会创建账户。");
  const [busy, setBusy] = React.useState(false);

  const send = async () => {
    try { setBusy(true); const result = await requestCode(email); setEmail(result.email); setSent(true); setMessage("验证码已发送，请查收邮箱。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法发送验证码，请稍后重试。"); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    try { setBusy(true); await verifyCode(email, code); router.replace(safeReturnTo(returnTo) as never); }
    catch (error) { setMessage(error instanceof Error ? error.message : "验证码无效或已过期。"); }
    finally { setBusy(false); }
  };

  return <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} style={{ backgroundColor: colors.background }}><PaperCard tone="paper" style={{ gap: 14 }}><ScreenTitle title="登录 OneTapReality" caption="ACCOUNT" /><Text selectable style={{ color: colors.muted, lineHeight: 22 }}>{message}</Text><TextInput accessibilityLabel="登录邮箱" autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} placeholder="你的邮箱" style={{ borderBottomColor: colors.line, borderBottomWidth: 1, color: colors.ink, padding: 10 }} value={email} />{sent ? <><TextInput accessibilityLabel="登录验证码" keyboardType="number-pad" maxLength={6} onChangeText={setCode} placeholder="6 位验证码" style={{ borderBottomColor: colors.line, borderBottomWidth: 1, color: colors.ink, padding: 10 }} value={code} /><AppButton disabled={busy} label="验证并登录" onPress={() => void verify()} /><AppButton disabled={busy} label="重新发送验证码" tone="secondary" onPress={() => void send()} /></> : <AppButton disabled={busy} label="发送验证码" onPress={() => void send()} />}</PaperCard></ScrollView>;
}
