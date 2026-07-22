import { Pressable, Text, View } from "react-native";

import { colors } from "../../components/ui";
import type { ReviewGroup } from "./model";
import {
  acceptAllInGroup,
  rejectAllInGroup,
  reviewDisclaimer,
  setCandidateStatus,
  summarizeReview,
} from "./model";

function SmallButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderRadius: 10,
        borderWidth: 1,
        opacity: pressed ? 0.85 : 1,
        paddingHorizontal: 10,
        paddingVertical: 6,
      })}
    >
      <Text style={{ color: colors.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const statusLabels = {
  pending: "待确认",
  accepted: "已接受",
  rejected: "已拒绝",
} as const;

/**
 * AI 建议确认面板：展示候选组、可解释证据与候选数量，
 * 支持逐项与批量接受/拒绝。所有变更通过 onChange 回传，由人做最终决定。
 */
export function ReviewPanel({
  groups,
  onChange,
}: {
  groups: ReviewGroup[];
  onChange: (groups: ReviewGroup[]) => void;
}) {
  const summary = summarizeReview(groups);

  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{reviewDisclaimer}</Text>
      <Text style={{ color: colors.ink, fontSize: 14 }} testID="review-summary">
        共 {summary.total} 条建议 · 待确认 {summary.pending} · 已接受 {summary.accepted} · 已拒绝 {summary.rejected}
      </Text>
      {groups.map((group) => (
        <View
          key={group.id}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: 14,
            borderWidth: 1,
            gap: 10,
            padding: 12,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>
            {group.title}（{group.candidates.length} 条）
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SmallButton
              label="全部接受"
              testID={`accept-all-${group.id}`}
              onPress={() => onChange(acceptAllInGroup(groups, group.id))}
            />
            <SmallButton
              label="全部拒绝"
              testID={`reject-all-${group.id}`}
              onPress={() => onChange(rejectAllInGroup(groups, group.id))}
            />
          </View>
          {group.candidates.map((candidate) => (
            <View key={candidate.id} style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "600" }}>
                {candidate.summary} · {statusLabels[candidate.status]}
              </Text>
              {candidate.evidence.map((evidence, index) => (
                <Text
                  key={`${candidate.id}-evidence-${index}`}
                  style={{ color: colors.muted, fontSize: 13 }}
                >
                  依据：{evidence.detail}
                </Text>
              ))}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <SmallButton
                  label="接受"
                  testID={`accept-${candidate.id}`}
                  onPress={() =>
                    onChange(setCandidateStatus(groups, candidate.id, "accepted"))
                  }
                />
                <SmallButton
                  label="拒绝"
                  testID={`reject-${candidate.id}`}
                  onPress={() =>
                    onChange(setCandidateStatus(groups, candidate.id, "rejected"))
                  }
                />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
