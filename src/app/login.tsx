import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, bodyFont, colors, serifFont } from "../components/ui";
import { useAuth } from "../features/auth/auth-provider";

function safeReturnTo(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path?.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { isAuthReady, rememberedEmail, requestCode, verifyCode } = useAuth();
  const [email, setEmail] = React.useState(rememberedEmail ?? "");
  const [code, setCode] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (rememberedEmail) {
      setEmail((current) => current || rememberedEmail);
    }
  }, [rememberedEmail]);

  const send = async () => {
    if (!isAuthReady) return;
    if (!email.trim()) { setMessage("请输入邮箱地址。"); return; }
    try { setBusy(true); setMessage(""); const result = await requestCode(email); setEmail(result.email); setSent(true); setMessage("验证码已发送，请查收邮箱。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法发送验证码，请稍后重试。"); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!isAuthReady) return;
    if (!code.trim() || code.trim().length !== 6) { setMessage("请输入 6 位验证码。"); return; }
    try { setBusy(true); setMessage(""); await verifyCode(email, code); router.replace(safeReturnTo(returnTo) as never); }
    catch (error) { setMessage(error instanceof Error ? error.message : "验证码无效或已过期。"); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.brand}>一触如初</Text>
          <Text style={styles.brandCaption}>ONE TAP REALITY</Text>
          <View style={styles.titleRule} />
        </View>
        <Text style={styles.hint}>{message || "使用邮箱验证码登录，首次验证将自动创建账户。"}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>邮箱</Text>
          <TextInput
            accessibilityLabel="登录邮箱"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={(text) => { setEmail(text); setMessage(""); }}
            placeholder="your@email.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={email}
          />
        </View>

        {sent ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>验证码</Text>
              <TextInput
                accessibilityLabel="登录验证码"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(text) => { setCode(text); setMessage(""); }}
                placeholder="000000"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={code}
              />
            </View>
            <AppButton disabled={busy || !isAuthReady} label="验证并登录" onPress={() => void verify()} />
            <AppButton disabled={busy || !isAuthReady} label="重新发送验证码" tone="secondary" onPress={() => void send()} />
          </>
        ) : (
          <AppButton
            disabled={busy || !isAuthReady}
            label={isAuthReady ? "发送验证码" : "正在读取账户…"}
            onPress={() => void send()}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.paper, borderColor: colors.paperEdge, borderRadius: 22, borderWidth: 1, gap: 14, padding: 24 },
  header: { alignItems: "center", gap: 4, marginBottom: 4 },
  brand: { color: colors.ink, fontFamily: serifFont, fontSize: 30, letterSpacing: 4 },
  brandCaption: { color: colors.warmAccent, fontFamily: bodyFont, fontSize: 11, letterSpacing: 3 },
  titleRule: { backgroundColor: colors.warmAccent, borderRadius: 2, height: 3, marginTop: 10, width: 40 },
  hint: { color: colors.muted, fontFamily: bodyFont, fontSize: 14, lineHeight: 22, textAlign: "center" },
  field: { gap: 6 },
  label: { color: colors.ink, fontFamily: bodyFont, fontSize: 13, fontWeight: "700" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
});
