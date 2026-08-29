import { useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  InputAccessoryView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppButton, bodyFont, colors, serifFont } from "../components/ui";
import { useAuth } from "../features/auth/auth-provider";
import { toUserFacingBackendError } from "../services/backend/user-facing-error";

function safeReturnTo(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path?.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function focusTextInput(input: Pick<TextInput, "focus"> | null): void {
  input?.focus();
}

export function handleEmailSubmit(
  sent: boolean,
  codeInput: Pick<TextInput, "focus"> | null,
): void {
  if (sent) {
    focusTextInput(codeInput);
    return;
  }
  Keyboard.dismiss();
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
  const codeInputRef = React.useRef<TextInput>(null);

  React.useEffect(() => {
    if (rememberedEmail) {
      setEmail((current) => current || rememberedEmail);
    }
  }, [rememberedEmail]);

  const send = async () => {
    if (!isAuthReady) return;
    if (!email.trim()) { setMessage("请输入邮箱地址。"); return; }
    try { setBusy(true); setMessage(""); const result = await requestCode(email); setEmail(result.email); setSent(true); setMessage("验证码已发送，请查收邮箱。"); }
    catch (error) { setMessage(toUserFacingBackendError(error, "暂时无法发送验证码，请稍后重试。")); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!isAuthReady) return;
    if (!code.trim() || code.trim().length !== 6) { setMessage("请输入 6 位验证码。"); return; }
    try { setBusy(true); setMessage(""); await verifyCode(email, code); router.replace(safeReturnTo(returnTo) as never); }
    catch (error) { setMessage(toUserFacingBackendError(error, "验证码无效或已过期，请重新获取。")); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
      testID="login-keyboard-avoiding-view">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        testID="login-scroll-view">
        <View
          accessible={false}
          onTouchEnd={Keyboard.dismiss}
          style={styles.background}
          testID="login-background">
          <View
            accessible={false}
            onTouchEnd={(event) => {
              Keyboard.dismiss();
              event.stopPropagation();
            }}
            style={styles.card}
            testID="login-card">
            <View style={styles.header}>
              <Text style={styles.brand}>一触如初</Text>
              <Text style={styles.brandCaption}>ONE TAP REALITY</Text>
              <View style={styles.titleRule} />
            </View>
            <Text style={styles.hint}>{message || "使用邮箱验证码登录，首次验证将自动创建账户。"}</Text>

            <View
              onTouchEnd={(event) => event.stopPropagation()}
              style={styles.field}
              testID="login-email-control">
              <Text style={styles.label}>邮箱</Text>
              <TextInput
                accessibilityLabel="登录邮箱"
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={(text) => { setEmail(text); setMessage(""); }}
                onSubmitEditing={() => handleEmailSubmit(sent, codeInputRef.current)}
                placeholder="your@email.com"
                placeholderTextColor={colors.muted}
                returnKeyType={sent ? "next" : "done"}
                style={styles.input}
                value={email}
              />
            </View>

            {sent ? (
              <>
                <View
                  onTouchEnd={(event) => event.stopPropagation()}
                  style={styles.field}
                  testID="login-code-control">
                  <Text style={styles.label}>验证码</Text>
                  <TextInput
                    accessibilityLabel="登录验证码"
                    keyboardType="number-pad"
                    inputAccessoryViewID={Platform.OS === "ios" ? "login-code-accessory" : undefined}
                    maxLength={6}
                    onChangeText={(text) => { setCode(text); setMessage(""); }}
                    onSubmitEditing={Keyboard.dismiss}
                    placeholder="000000"
                    placeholderTextColor={colors.muted}
                    ref={codeInputRef}
                    returnKeyType="done"
                    style={styles.input}
                    testID="login-code-input"
                    value={code}
                  />
                </View>
                <View
                  onTouchEnd={(event) => event.stopPropagation()}
                  testID="login-verify-control">
                  <AppButton disabled={busy || !isAuthReady} label="验证并登录" onPress={() => void verify()} />
                </View>
                <View
                  onTouchEnd={(event) => event.stopPropagation()}
                  testID="login-resend-control">
                  <AppButton disabled={busy || !isAuthReady} label="重新发送验证码" tone="secondary" onPress={() => void send()} />
                </View>
              </>
            ) : (
              <View
                onTouchEnd={(event) => event.stopPropagation()}
                testID="login-send-control">
                <AppButton
                  disabled={busy || !isAuthReady}
                  label={isAuthReady ? "发送验证码" : "正在读取账户…"}
                  onPress={() => void send()}
                />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      {sent && Platform.OS === "ios" ? (
        <InputAccessoryView nativeID="login-code-accessory">
          <View style={styles.accessory}>
            <Pressable
              accessibilityLabel="完成"
              accessibilityRole="button"
              hitSlop={12}
              onPress={Keyboard.dismiss}>
              <Text style={styles.accessoryButton}>完成</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center" },
  background: { flex: 1, justifyContent: "center", padding: 24 },
  accessory: { alignItems: "flex-end", backgroundColor: colors.paper, borderTopColor: colors.line, borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
  accessoryButton: { color: colors.accent, fontFamily: bodyFont, fontSize: 16, fontWeight: "700" },
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
