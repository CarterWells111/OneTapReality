import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ProfileAvatar } from "../../components/profile-avatar";
import { AppButton, bodyFont, colors, Section } from "../../components/ui";
import {
  maxBioLength,
  normalizeBio,
  normalizeNickname,
  type LocalProfile,
} from "../../features/profile/local-profile";
import { useProfile } from "../../features/profile/profile-provider";

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, isProfileReady, updateProfile } = useProfile();
  const [draft, setDraft] = React.useState<LocalProfile | null>(null);
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const isSavePending = React.useRef(false);

  React.useEffect(() => {
    setDraft(isProfileReady ? profile : null);
  }, [isProfileReady, profile]);

  const selectAvatar = async () => {
    setError("");

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("未获得照片权限。你可以在系统设置中允许访问后再选择头像。");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setDraft((current) => (current ? { ...current, avatarUri: result.assets[0].uri } : current));
      }
    } catch {
      setError("无法选择头像，请重试。");
    }
  };

  const saveProfile = async () => {
    if (isSavePending.current) {
      return;
    }

    isSavePending.current = true;
    setIsSaving(true);
    try {
      await updateProfile({
        nickname: normalizeNickname(draft!.nickname),
        avatarUri: draft!.avatarUri,
        bio: normalizeBio(draft!.bio ?? ""),
      });
      router.back();
    } catch {
      setError("保存资料失败，请重试。");
    } finally {
      isSavePending.current = false;
      setIsSaving(false);
    }
  };

  if (!isProfileReady || !draft) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.loading}>
        <Text selectable style={styles.helper}>正在读取资料…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.avatarSection}>
        <Pressable
          accessibilityLabel="点击更换头像"
          accessibilityRole="button"
          onPress={() => void selectAvatar()}
          style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
        >
          <ProfileAvatar avatarUri={draft.avatarUri} nickname={draft.nickname} size={96} />
        </Pressable>
        <Text selectable style={styles.avatarHint}>点击头像更换照片</Text>
      </View>

      <Section title="个人资料">
        <Text selectable style={styles.label}>昵称</Text>
        <TextInput
          accessibilityLabel="昵称"
          onChangeText={(nickname) => setDraft((current) => (current ? { ...current, nickname } : current))}
          placeholder="昵称"
          style={styles.input}
          value={draft.nickname}
        />
        <Text selectable style={styles.label}>签名</Text>
        <TextInput
          accessibilityLabel="签名"
          maxLength={maxBioLength}
          onChangeText={(bio) => setDraft((current) => (current ? { ...current, bio } : current))}
          placeholder="一句属于你们的旅行签名"
          style={styles.input}
          value={draft.bio ?? ""}
        />
      </Section>

      {error ? <Text selectable style={styles.error}>{error}</Text> : null}

      <Section title="数据与隐私">
        <View style={styles.privacyCard}>
          <Text selectable style={styles.privacyTitle}>资料不会同步到云端</Text>
          <Text selectable style={styles.helper}>昵称与头像用于个人展示；选择照片不会上传或分享。</Text>
        </View>
      </Section>

      <Section title="后端状态">
        <Text selectable style={styles.helper}>手动检查后端服务连接状态。</Text>
        <AppButton label="打开后端状态" onPress={() => router.push("/backend")} tone="secondary" />
      </Section>

      <AppButton disabled={isSaving} label={isSaving ? "正在保存资料…" : "保存资料"} onPress={() => void saveProfile()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, padding: 20 },
  loading: { padding: 20 },
  avatarSection: { alignItems: "center", gap: 10 },
  avatarButton: { borderRadius: 48 },
  avatarHint: { color: colors.muted, fontFamily: bodyFont, fontSize: 13, lineHeight: 21 },
  helper: { color: colors.muted, fontFamily: bodyFont, lineHeight: 21, textAlign: "center" },
  label: { color: colors.ink, fontFamily: bodyFont, fontSize: 15, fontWeight: "700" },
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
  error: { color: colors.danger, fontFamily: bodyFont, lineHeight: 21 },
  privacyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  privacyTitle: { color: colors.ink, fontFamily: bodyFont, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.82 },
});
