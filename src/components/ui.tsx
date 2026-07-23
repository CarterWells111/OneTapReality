import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * OneTapReality 手账设计系统。
 * 语义色板经过测试锁定（见 __tests__/brand-palette.test.ts）：
 * background / accent / warmAccent / accentSoft 不可更改。
 * 其余为纸感暖色，可自由演进。
 */
export const colors = {
  background: "#F7F2EA",
  surface: "#FBF7EF",
  paper: "#EFE2CF",
  paperEdge: "#E4D6C1",
  ink: "#2F2A26",
  muted: "#6E6154",
  line: "#D8CFC4",
  accent: "#56708A",
  warmAccent: "#B56B52",
  accentSoft: "#FFF2CF",
  danger: "#A33A33",
} as const;

/** 标题用衬线字体，营造旧书 / 手账感；正文仍用系统字体保证清晰。 */
export const serifFont = Platform.select({ android: "serif", default: "Georgia" });

export function AppButton({
  label,
  onPress,
  disabled = false,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger" | "warm";
}) {
  const backgroundColor =
    tone === "primary"
      ? colors.accent
      : tone === "warm"
        ? colors.warmAccent
        : tone === "danger"
          ? "#F8E4E2"
          : colors.accentSoft;
  const textColor =
    tone === "primary" || tone === "warm"
      ? "#FFFFFF"
      : tone === "danger"
        ? colors.danger
        : colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor,
        borderRadius: 16,
        minHeight: 48,
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        paddingHorizontal: 18,
      })}
    >
      <Text selectable style={{ color: textColor, fontSize: 16, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 区块小标题：中文衬线主标 + 可选英文小注，像册页栏目名。 */
export function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text selectable style={styles.sectionTitle}>
          {title}
        </Text>
        {caption ? (
          <Text selectable style={styles.sectionCaption}>
            {caption}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** 页面大标题：中文手账标题 + 英文小注 + 一小段砖红笔触下划线。 */
export function ScreenTitle({
  title,
  caption,
  right,
}: {
  title: string;
  caption?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.screenTitleRow}>
      <View style={styles.screenTitleCopy}>
        <Text selectable style={styles.screenTitleText}>
          {title}
        </Text>
        {caption ? (
          <Text selectable style={styles.screenTitleCaption}>
            {caption}
          </Text>
        ) : null}
        <View style={styles.screenTitleRule} />
      </View>
      {right ? <View style={styles.screenTitleRight}>{right}</View> : null}
    </View>
  );
}

/** 纸页卡片：暖白 / 米杏两种底色，细边 + 极轻纸影。 */
export function PaperCard({
  children,
  style,
  tone = "surface",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "surface" | "paper";
}) {
  return (
    <View
      style={[styles.paperCard, tone === "paper" ? styles.paperCardPaper : styles.paperCardSurface, style]}
    >
      {children}
    </View>
  );
}

/** 手账式虚线分隔。 */
export function SketchDivider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.sketchDivider, style]} />;
}

/** 纸签 / 贴纸小标签。 */
export function Tag({ label, tone = "warm" }: { label: string; tone?: "warm" | "blue" }) {
  return (
    <View style={[styles.tag, tone === "blue" ? styles.tagBlue : styles.tagWarm]}>
      <Text selectable style={[styles.tagText, { color: tone === "blue" ? colors.accent : colors.warmAccent }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 19, fontWeight: "700" },
  sectionCaption: { color: colors.warmAccent, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  screenTitleRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  screenTitleCopy: { flex: 1 },
  screenTitleText: { color: colors.ink, fontFamily: serifFont, fontSize: 30, fontWeight: "800" },
  screenTitleCaption: { color: colors.warmAccent, fontSize: 12, fontWeight: "700", letterSpacing: 2, marginTop: 2 },
  screenTitleRule: { backgroundColor: colors.warmAccent, borderRadius: 2, height: 3, marginTop: 8, width: 34 },
  screenTitleRight: { paddingTop: 4 },
  paperCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    shadowColor: colors.ink,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    ...Platform.select({ android: { elevation: 1 } }),
  },
  paperCardSurface: { backgroundColor: colors.surface, borderColor: colors.line },
  paperCardPaper: { backgroundColor: colors.paper, borderColor: colors.paperEdge },
  sketchDivider: { borderStyle: "dashed", borderTopColor: colors.line, borderTopWidth: 1 },
  tag: { alignSelf: "flex-start", borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  tagWarm: { backgroundColor: "rgba(181, 107, 82, 0.08)", borderColor: colors.warmAccent },
  tagBlue: { backgroundColor: "rgba(86, 112, 138, 0.08)", borderColor: colors.accent },
  tagText: { fontSize: 12, fontWeight: "800" },
});
