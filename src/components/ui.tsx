import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { bodyFontFamily, headingFontFamily } from "../features/typography/fonts";

/**
 * OneTapReality 手账设计系统。
 * 语义色板经过测试锁定（见 __tests__/brand-palette.test.ts）：
 * background / accent / warmAccent / accentSoft 不可更改。
 * 其余为纸感暖色，可自由演进。
 */
export const colors = {
  background: "#F7F2EA",
  surface: "#F7F2EA",
  paper: "#EFE2CF",
  paperEdge: "#D8CFC4",
  ink: "#2F2A26",
  muted: "#56708A",
  line: "#D8CFC4",
  accent: "#B56B52",
  warmAccent: "#B56B52",
  accentSoft: "#EFE2CF",
  danger: "#B56B52",
} as const;

/** 标题与正文使用本地中文字体，营造手绘海报 / 打字机资料页气质。 */
export const serifFont = headingFontFamily;
export const bodyFont = bodyFontFamily;

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
          ? colors.paper
          : colors.accentSoft;
  const textColor =
    tone === "primary" || tone === "warm"
      ? colors.background
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
      <Text selectable style={{ color: textColor, fontFamily: bodyFont, fontSize: 16 }}>
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
  sectionTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 19 },
  sectionCaption: { color: colors.warmAccent, fontFamily: bodyFont, fontSize: 11, letterSpacing: 1.5 },
  screenTitleRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  screenTitleCopy: { flex: 1 },
  screenTitleText: { color: colors.ink, fontFamily: serifFont, fontSize: 30 },
  screenTitleCaption: { color: colors.warmAccent, fontFamily: bodyFont, fontSize: 12, letterSpacing: 2, marginTop: 2 },
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
  tagText: { fontFamily: bodyFont, fontSize: 12 },
});
