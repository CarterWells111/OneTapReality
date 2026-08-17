import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton, colors, Section } from "../../components/ui";
import { useMemories } from "../../features/memories/memories-provider";
import { useAuth } from "../../features/auth/auth-provider";

export default function PrivacyScreen() {
  const router = useRouter();
  const { isAuthReady, user } = useAuth();
  const { clearAllMemories } = useMemories();

  const confirmClear = () => {
    Alert.alert("删除所有记忆？", "这会删除旅行册、照片引用和草稿，操作不可恢复。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => void clearAllMemories() },
    ]);
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
          本地旅行册默认保存在设备 SQLite 中；旅行信息、照片 URI 和版式不会自动上传。
        </PrivacyCard>
      </Section>

      <Section title="账户与 NFC 礼品共享">
        <PrivacyCard title="只在明确发布时上传">
          你可以使用邮箱验证码登录。owner 或已激活的 editor 只有显式发布云端版本时，才会上传共享快照和该版本所选的照片副本；发布不会自动上传或修改设备上的本地原件。
        </PrivacyCard>
        <PrivacyCard title="共享角色与首次激活">
          owner 可邀请 viewer 或 editor，并可随时切换权限。viewer 和 editor 都须使用匹配邀请邮箱的账号完成首次 NFC 激活，之后才能查看完整相册预览。
        </PrivacyCard>
        <PrivacyCard title="云端共享编辑">
          viewer 只读；editor 可使用完整 Canvas 直接发布新版本，但只修改云端共享快照，不修改本地原件，本地原件也不会自动上传。
        </PrivacyCard>
        <PrivacyCard title="敏感管理需 owner 批准">
          editor 对整册删除、移除成员或修改权限只能提出申请并等待 owner 批准；owner 可直接管理。成员被移除、权限被撤销或礼品停用后，服务端立即拒绝访问和未完成提交。
        </PrivacyCard>
        <PrivacyCard title="链接不是实体碰卡证明">
          客户端不保存礼品 token；链接只能证明持有链接，不能证明请求来自实体 NFC 碰卡。staging 与 production 数据严格隔离。
        </PrivacyCard>
      </Section>

      <Section title="内容生成说明">
        <PrivacyCard title="不识别图像内容">
          内容生成基于你填写的标题、城市、日期、照片数量和顺序，不识别图像中的人物或具体内容。
        </PrivacyCard>
      </Section>

      <Section title="礼品停用与删除">
        <PrivacyCard title="本地与共享数据分开管理">
          本地删除不会停用已发布的礼品。礼品停用后，访问和共享快照会立即撤销；私有 R2 媒体由维护任务异步删除，删除失败时会重试。
        </PrivacyCard>
      </Section>

      <Section title="数据管理">
        <PrivacyCard title="删除不可恢复">删除后旅行册、照片引用和草稿将被移除。</PrivacyCard>
        <AppButton
          disabled={!isAuthReady}
          label={user ? "删除所有数据" : "登录后管理本地数据"}
          onPress={user ? confirmClear : () => router.push("/login?returnTo=/privacy" as never)}
          tone={user ? "danger" : "secondary"}
        />
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
});
