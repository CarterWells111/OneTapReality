import * as React from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton, colors, Section } from "../../components/ui";
import { useMemories } from "../../features/memories/memories-provider";
import { useAuth } from "../../features/auth/auth-provider";
import { usePrivacyLocalLibrary } from "../../features/auth/privacy-local-library";
import {
  BackendApiClient,
  BackendApiError,
  type AccountDeletionChallenge,
  type AccountDeletionReceipt,
} from "../../services/backend/api-client";

function deletionErrorMessage(error: unknown): string {
  if (!(error instanceof BackendApiError)) return "暂时无法完成账号删除，请检查网络后重试。";
  switch (error.code) {
    case "invalid_deletion_code": return "验证码不正确，请重新输入。";
    case "deletion_challenge_expired": return "验证码已过期，请重新获取。";
    case "deletion_challenge_used": return "这次验证已使用，请重新获取验证码。";
    case "deletion_challenge_rate_limited": return "请求过于频繁，请稍后再获取验证码。";
    case "network_unavailable": return "网络不可用，请连接网络后重试。";
    default: return "暂时无法完成账号删除，请稍后重试。";
  }
}

type DeletionUiOperation = {
  allowSignedOutCompletion: boolean;
  id: number;
  identityKey: string;
  signedOutGeneration: number | null;
};

function deletionIdentityKey(accessToken: string, email: string, generation: number): string {
  return `${generation}\u0000${accessToken}\u0000${email.trim().toLowerCase()}`;
}

export default function PrivacyScreen() {
  const router = useRouter();
  const client = React.useMemo(() => new BackendApiClient(), []);
  const {
    forgetRememberedEmail,
    getSessionGeneration,
    isAuthReady,
    session,
    sessionGeneration,
    signOut,
    user,
  } = useAuth();
  const {
    accountLibraryKey,
    currentLibraryIsGuest,
    deleteAccountLibrary,
    isLibraryReady,
  } = usePrivacyLocalLibrary();
  const { clearAllMemories } = useMemories();
  const [challenge, setChallenge] = React.useState<AccountDeletionChallenge | null>(null);
  const [code, setCode] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [isDeletingLocal, setDeletingLocal] = React.useState(false);
  const [isDeletingAccount, setDeletingAccount] = React.useState(false);
  const [deletionError, setDeletionError] = React.useState("");
  const [receipt, setReceipt] = React.useState<AccountDeletionReceipt | null>(null);
  const sessionIdentity = session
    ? deletionIdentityKey(session.accessToken, session.user.email, sessionGeneration)
    : null;
  const sessionStateIdentity = sessionIdentity ?? `signed-out:${sessionGeneration}`;
  const sessionIdentityRef = React.useRef<string | null>(sessionIdentity);
  const previousSessionStateIdentity = React.useRef(sessionStateIdentity);
  const operationSequence = React.useRef(0);
  const activeDeletionOperation = React.useRef<DeletionUiOperation | null>(null);
  const getSessionGenerationRef = React.useRef(getSessionGeneration);
  sessionIdentityRef.current = sessionIdentity;
  getSessionGenerationRef.current = getSessionGeneration;

  const beginDeletionOperation = (identityKey: string): DeletionUiOperation => {
    const operation = {
      allowSignedOutCompletion: false,
      id: operationSequence.current + 1,
      identityKey,
      signedOutGeneration: null,
    };
    operationSequence.current = operation.id;
    activeDeletionOperation.current = operation;
    setDeletingAccount(true);
    return operation;
  };
  const ownsDeletionOperation = (operation: DeletionUiOperation): boolean => (
    activeDeletionOperation.current?.id === operation.id
  );
  const canCommitDeletionUi = (operation: DeletionUiOperation): boolean => (
    ownsDeletionOperation(operation)
    && (
      sessionIdentityRef.current === operation.identityKey
      || (
        operation.allowSignedOutCompletion
        && sessionIdentityRef.current === null
        && getSessionGenerationRef.current() === operation.signedOutGeneration
      )
    )
  );
  const finishDeletionOperation = (operation: DeletionUiOperation) => {
    if (!ownsDeletionOperation(operation)) return;
    activeDeletionOperation.current = null;
    setDeletingAccount(false);
  };

  React.useEffect(() => {
    if (previousSessionStateIdentity.current === sessionStateIdentity) return;
    previousSessionStateIdentity.current = sessionStateIdentity;
    setChallenge(null);
    setCode("");
    setConfirmation("");
    setDeletionError("");
    setReceipt(null);

    const operation = activeDeletionOperation.current;
    const isOwnedSignedOutCompletion = operation !== null
      && operation.allowSignedOutCompletion
      && sessionIdentity === null
      && operation.signedOutGeneration === sessionGeneration;
    if (!isOwnedSignedOutCompletion) {
      activeDeletionOperation.current = null;
      setDeletingAccount(false);
    }
  }, [sessionIdentity, sessionGeneration, sessionStateIdentity]);

  const confirmClear = () => {
    const libraryName = currentLibraryIsGuest ? "本机访客旅行册" : "当前账户的本机旅行册";
    Alert.alert("删除本机旅行册？", `这会删除${libraryName}中的旅行册、照片引用和草稿，操作不可恢复；独立的其他本机库及已发布礼品不会因此删除。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          setDeletingLocal(true);
          void clearAllMemories()
            .catch(() => Alert.alert("未能删除本机旅行册", "本机数据没有完整删除，请稍后重试。"))
            .finally(() => setDeletingLocal(false));
        },
      },
    ]);
  };

  const requestDeletionChallenge = async () => {
    const accessToken = session?.accessToken;
    if (!accessToken || !sessionIdentity) {
      router.push("/login?returnTo=/privacy" as never);
      return;
    }
    const operation = beginDeletionOperation(sessionIdentity);
    setDeletionError("");
    try {
      const nextChallenge = await client.requestAccountDeletionChallenge(accessToken);
      if (canCommitDeletionUi(operation)) {
        setChallenge(nextChallenge);
        setCode("");
        setConfirmation("");
      }
    } catch (error) {
      if (canCommitDeletionUi(operation)) setDeletionError(deletionErrorMessage(error));
    } finally {
      finishDeletionOperation(operation);
    }
  };

  const confirmAccountDeletion = async () => {
    const accessToken = session?.accessToken;
    const requestedAccountKey = accountLibraryKey;
    if (!accessToken || !challenge || !requestedAccountKey || !sessionIdentity) return;
    const requestedIdentity = {
      accessToken,
      email: session.user.email,
      generation: sessionGeneration,
    };
    if (!/^\d{6}$/u.test(code)) {
      setDeletionError("请输入邮件中的六位验证码。");
      return;
    }
    if (confirmation !== "DELETE") {
      setDeletionError("请输入 DELETE 以确认永久删除。");
      return;
    }

    const operation = beginDeletionOperation(sessionIdentity);
    setDeletionError("");
    try {
      const nextReceipt = await client.deleteAccount(accessToken, {
        challengeId: challenge.challengeId,
        code,
        confirmation: "DELETE",
      });
      if (
        ownsDeletionOperation(operation)
        && sessionIdentityRef.current === operation.identityKey
        && getSessionGenerationRef.current() === requestedIdentity.generation
      ) {
        // From this point, a null identity can be the synchronous local
        // sign-out performed by this deletion. A different account still
        // cancels all UI ownership immediately.
        operation.allowSignedOutCompletion = true;
        operation.signedOutGeneration = requestedIdentity.generation + 1;
      }
      let localSessionCleared = false;
      for (let attempt = 0; attempt < 2 && !localSessionCleared; attempt += 1) {
        try {
          // signOut invalidates the auth generation before its first await, so
          // no account-scoped write can start after local deletion begins.
          const result = await signOut(requestedIdentity);
          localSessionCleared = result === "applied";
        } catch {
          // Retry once because a persisted revoked session must not survive relaunch.
        }
      }
      let localCleanupComplete = false;
      for (let attempt = 0; attempt < 2 && !localCleanupComplete; attempt += 1) {
        try {
          await deleteAccountLibrary(requestedAccountKey);
          localCleanupComplete = true;
        } catch {
          // A second idempotent attempt covers transient local-storage failures.
        }
      }
      let rememberedEmailCleared = false;
      for (let attempt = 0; attempt < 2 && !rememberedEmailCleared; attempt += 1) {
        try {
          const result = await forgetRememberedEmail(requestedIdentity);
          rememberedEmailCleared = result === "applied";
        } catch {
          // Retry once before reporting that device cleanup needs support.
        }
      }
      localCleanupComplete = localCleanupComplete && localSessionCleared && rememberedEmailCleared;
      if (canCommitDeletionUi(operation)) {
        setReceipt(nextReceipt);
        setChallenge(null);
        Alert.alert(
          "账号删除已受理",
          `受理编号：${nextReceipt.receiptId}\n预计最晚完成：${nextReceipt.completeBy}${localCleanupComplete ? "" : "\n本机账号旅行册清理未完成。独立访客旅行册不会因此删除，请联系 support@onetapreality.com 协助处理设备残留。"}`,
          [{ text: "知道了" }],
        );
      }
    } catch (error) {
      if (canCommitDeletionUi(operation)) setDeletionError(deletionErrorMessage(error));
    } finally {
      finishDeletionOperation(operation);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text selectable style={styles.eyebrow}>隐私优先</Text>
        <Text selectable style={styles.title}>数据与隐私声明</Text>
        <Text selectable style={styles.helper}>本地旅行册默认留在设备；发布 NFC 礼品前会明确说明共享范围。</Text>
      </View>

      <Section title="数据存储说明">
        <PrivacyCard title="本地旅行册">
          本地旅行册默认保存在此设备；旅行信息、所选照片引用和页面版式不会自动上传。
        </PrivacyCard>
      </Section>

      <Section title="账户与 NFC 礼品共享">
        <PrivacyCard title="只在明确发布时上传">
          你可以使用邮箱验证码登录。礼品拥有者或已激活的可编辑成员只有主动发布共享版本时，才会上传共享快照和该版本所选的照片副本；发布不会自动上传或修改设备上的本地原件。
        </PrivacyCard>
        <PrivacyCard title="共享角色与首次激活">
          礼品拥有者可邀请只读成员或可编辑成员，并可随时切换权限。受邀成员须使用匹配邀请邮箱的账号完成首次礼品激活，之后才能查看完整相册预览。
        </PrivacyCard>
        <PrivacyCard title="云端共享编辑">
          只读成员只能查看；可编辑成员可使用页面编辑器发布新版本，但只修改云端共享快照，不修改本地原件，本地原件也不会自动上传。
        </PrivacyCard>
        <PrivacyCard title="敏感管理需礼品拥有者批准">
          可编辑成员对整册删除、移除成员或修改权限只能提出申请并等待礼品拥有者批准。成员被移除、权限被撤销或礼品停用后，系统会立即拒绝后续访问和未完成的发布。
        </PrivacyCard>
        <PrivacyCard title="链接不是实体碰卡证明">
          应用不保存礼品链接中的访问凭据；链接只能证明持有链接，不能证明请求来自实体 NFC 碰卡。测试礼品与正式礼品的数据相互隔离。
        </PrivacyCard>
      </Section>

      <Section title="内容生成说明">
        <PrivacyCard title="不识别图像内容">
          内容生成基于你填写的标题、城市、日期、照片数量和顺序，不识别图像中的人物或具体内容。
        </PrivacyCard>
      </Section>

      <Section title="礼品停用与删除">
        <PrivacyCard title="本地与共享数据分开管理">
          本地删除不会停用已发布的礼品。礼品停用后，访问和共享快照会立即撤销；私有媒体会在后台安全删除，失败时自动重试。
        </PrivacyCard>
      </Section>

      <Section title="数据管理">
        <PrivacyCard title="当前本机库">
          {currentLibraryIsGuest
            ? "当前为本机访客旅行册。删除只影响这一本机库，不会删除独立账户库或云端礼品。"
            : "当前为账户的本机旅行册。删除只影响当前本机库，不会停用或删除云端礼品。"}
        </PrivacyCard>
        <AppButton
          disabled={!isLibraryReady || isDeletingLocal || isDeletingAccount}
          label={isDeletingLocal ? "正在删除本机旅行册…" : "删除本机旅行册"}
          onPress={confirmClear}
          tone="danger"
        />
      </Section>

      <Section title="永久删除账号">
        {session ? (
          <>
            <PrivacyCard title="账号与云端删除范围">
              将永久停用你拥有的礼品，并删除共享快照、照片副本、邀请、成员关系及账号数据。所有会话会立即撤销，云端清理将在 24 小时内完成；独立的访客旅行册不会删除。
            </PrivacyCard>
            {!challenge ? (
              <AppButton
                disabled={!isAuthReady || isDeletingAccount}
                label={isDeletingAccount ? "正在发送验证码…" : "永久删除账号及云端数据"}
                onPress={() => void requestDeletionChallenge()}
                tone="danger"
              />
            ) : (
              <View style={styles.deletionForm}>
                <Text selectable style={styles.helper}>验证码已发送至 {user?.email}，请在到期前完成确认。</Text>
                <TextInput
                  accessibilityLabel="账号删除验证码"
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={(value) => setCode(value.replace(/\D/gu, ""))}
                  placeholder="六位验证码"
                  style={styles.input}
                  value={code}
                />
                <TextInput
                  accessibilityLabel="账号删除确认文字"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={setConfirmation}
                  placeholder="输入 DELETE"
                  style={styles.input}
                  value={confirmation}
                />
                <AppButton
                  disabled={isDeletingAccount}
                  label={isDeletingAccount ? "正在提交删除…" : "确认永久删除"}
                  onPress={() => void confirmAccountDeletion()}
                  tone="danger"
                />
                <AppButton
                  disabled={isDeletingAccount}
                  label="重新获取验证码"
                  onPress={() => void requestDeletionChallenge()}
                  tone="secondary"
                />
              </View>
            )}
          </>
        ) : (
          <>
            <PrivacyCard title="登录后可永久删除账号及云端数据">
              未登录时只能管理当前本机旅行册；登录后可在应用内验证并永久删除账号及云端数据。
            </PrivacyCard>
            <AppButton
              disabled={!isAuthReady}
              label="登录管理账号"
              onPress={() => router.push("/login?returnTo=/privacy" as never)}
              tone="secondary"
            />
          </>
        )}
        {deletionError ? <Text accessibilityRole="alert" selectable style={styles.error}>{deletionError}</Text> : null}
        {receipt ? (
          <Text selectable style={styles.helper}>账号删除已受理：{receipt.receiptId}。预计最晚完成：{receipt.completeBy}</Text>
        ) : null}
      </Section>
    </ScrollView>
  );
}

function PrivacyCard({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.card}>
      <Text selectable style={styles.cardTitle}>{title}</Text>
      <Text selectable style={styles.helper}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, padding: 20 },
  hero: { backgroundColor: colors.accentSoft, borderRadius: 22, gap: 8, padding: 20 },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  helper: { color: colors.muted, lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  deletionForm: { gap: 10 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
});
