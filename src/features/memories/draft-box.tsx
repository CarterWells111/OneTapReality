import * as React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { bodyFont, colors, serifFont } from "../../components/ui";
import { draftBoxCapacity, recycleBinRetentionDays } from "../../storage/memory-repository";
import type { Memory } from "../../types/memory";

type DraftBoxProps = {
  drafts: Memory[];
  discardedCount: number;
  onOpenDraft: (id: string) => void;
  onDiscardDraft: (id: string) => void;
  onOpenRecycleBin: () => void;
};

/** 月.日短格式；草稿列表在一行里同时放创建和最后编辑，完整日期太长。 */
function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function DraftRow({
  draft,
  onOpen,
  onDiscard,
}: {
  draft: Memory;
  onOpen: () => void;
  onDiscard: () => void;
}) {
  const confirmDiscard = () => {
    Alert.alert(
      "删除草稿",
      `「${draft.title}」会移入回收站，${recycleBinRetentionDays} 天内可以恢复，之后永久删除。`,
      [
        { text: "取消", style: "cancel" },
        { text: "删除", style: "destructive", onPress: onDiscard },
      ],
    );
  };

  const renderDeleteAction = () => (
    <Pressable
      accessibilityLabel={`删除草稿 ${draft.title}`}
      accessibilityRole="button"
      onPress={confirmDiscard}
      style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}
    >
      <Text selectable={false} style={styles.deleteActionText}>删除</Text>
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      friction={2}
      renderRightActions={renderDeleteAction}
      rightThreshold={32}
    >
      <Pressable
        accessibilityLabel={`继续编辑草稿 ${draft.title}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Text selectable style={styles.rowTitle}>{draft.title}</Text>
        <Text selectable style={styles.rowMeta}>
          {`创建于 ${shortDate(draft.createdAt)} · 编辑于 ${shortDate(draft.updatedAt)}`}
        </Text>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

/**
 * 首页草稿箱：默认收起，只占一行。展开后列出草稿，左滑可删除，
 * 末尾是回收站入口——被删草稿和被删旅行册都落在那里。
 */
export function DraftBox({
  drafts,
  discardedCount,
  onOpenDraft,
  onDiscardDraft,
  onOpenRecycleBin,
}: DraftBoxProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (drafts.length === 0 && discardedCount === 0) return null;

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={expanded ? "收起草稿箱" : "展开草稿箱"}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerCopy}>
          <Text selectable style={styles.headerTitle}>
            {`草稿箱 · ${drafts.length}/${draftBoxCapacity}`}
          </Text>
          <Text selectable style={styles.headerCaption}>LOCAL DRAFTS</Text>
        </View>
        <Text selectable={false} style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.list}>
          {drafts.length > 0 ? (
            <Text selectable style={styles.hint}>
              未正式保存的旅行册保留在此设备。左滑条目可删除。
            </Text>
          ) : (
            <Text selectable style={styles.hint}>草稿箱是空的。</Text>
          )}

          {drafts.map((draft) => (
            <DraftRow
              draft={draft}
              key={draft.id}
              onDiscard={() => onDiscardDraft(draft.id)}
              onOpen={() => onOpenDraft(draft.id)}
            />
          ))}

          <Pressable
            accessibilityLabel="打开回收站"
            accessibilityRole="button"
            onPress={onOpenRecycleBin}
            style={({ pressed }) => [styles.recycleRow, pressed && styles.pressed]}
          >
            <Text selectable style={styles.recycleText}>{`回收站 · ${discardedCount} 册`}</Text>
            <Text selectable={false} style={styles.chevron}>›</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
  headerCopy: { gap: 2 },
  headerTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 18, fontWeight: "700" },
  headerCaption: { color: colors.muted, fontFamily: bodyFont, fontSize: 11, letterSpacing: 1 },
  chevron: { color: colors.muted, fontSize: 14 },
  list: { gap: 10 },
  hint: { color: colors.muted, fontFamily: bodyFont, fontSize: 12.5, lineHeight: 19 },
  row: {
    backgroundColor: colors.paper,
    borderColor: colors.paperEdge,
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    padding: 16,
  },
  rowTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 18, fontWeight: "700" },
  rowMeta: { color: colors.muted, fontFamily: bodyFont, fontSize: 12.5 },
  deleteAction: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: 14,
    justifyContent: "center",
    marginLeft: 10,
    minHeight: 44,
    width: 84,
  },
  deleteActionText: { color: colors.background, fontFamily: bodyFont, fontSize: 14.5, fontWeight: "800" },
  recycleRow: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recycleText: { color: colors.ink, fontFamily: bodyFont, fontSize: 14.5 },
  pressed: { opacity: 0.82 },
});
