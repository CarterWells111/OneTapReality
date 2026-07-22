/**
 * AI 建议的人工确认工作流。
 * 所有证据只来自用户手填的元数据（标题、城市、日期、照片数量与顺序），
 * 不涉及、也不宣称人脸识别或地点识别能力。
 */

export const reviewDisclaimer =
  "以下建议仅基于你手动填写的标题、城市、日期和照片顺序生成，应用不会识别照片中的人物或地点。";

export type EvidenceSource =
  | "user-title"
  | "user-city"
  | "user-date"
  | "photo-count"
  | "photo-order";

export type ReviewEvidence = {
  source: EvidenceSource;
  detail: string;
};

export type CandidateStatus = "pending" | "accepted" | "rejected";

export type ReviewCandidate = {
  id: string;
  /** 建议内容的一句话概述。 */
  summary: string;
  /** 可解释证据；必须非空。 */
  evidence: ReviewEvidence[];
  status: CandidateStatus;
};

export type ReviewGroup = {
  id: string;
  title: string;
  candidates: ReviewCandidate[];
};

export type ReviewSummary = {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
};

/** 逐项设置候选状态；找不到 id 时返回原列表。 */
export function setCandidateStatus(
  groups: readonly ReviewGroup[],
  candidateId: string,
  status: CandidateStatus
): ReviewGroup[] {
  return groups.map((group) => ({
    ...group,
    candidates: group.candidates.map((candidate) =>
      candidate.id === candidateId ? { ...candidate, status } : candidate
    ),
  }));
}

/** 批量接受一组内所有待定候选。 */
export function acceptAllInGroup(
  groups: readonly ReviewGroup[],
  groupId: string
): ReviewGroup[] {
  return setAllInGroup(groups, groupId, "accepted");
}

/** 批量拒绝一组内所有待定候选。 */
export function rejectAllInGroup(
  groups: readonly ReviewGroup[],
  groupId: string
): ReviewGroup[] {
  return setAllInGroup(groups, groupId, "rejected");
}

function setAllInGroup(
  groups: readonly ReviewGroup[],
  groupId: string,
  status: CandidateStatus
): ReviewGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? {
          ...group,
          candidates: group.candidates.map((candidate) =>
            candidate.status === "pending" ? { ...candidate, status } : candidate
          ),
        }
      : group
  );
}

/** 统计候选数量，供界面展示。 */
export function summarizeReview(groups: readonly ReviewGroup[]): ReviewSummary {
  const summary: ReviewSummary = { total: 0, pending: 0, accepted: 0, rejected: 0 };
  for (const group of groups) {
    for (const candidate of group.candidates) {
      summary.total += 1;
      summary[candidate.status] += 1;
    }
  }
  return summary;
}

/** 只有被明确接受的候选才会流向后续步骤。 */
export function acceptedCandidates(groups: readonly ReviewGroup[]): ReviewCandidate[] {
  return groups.flatMap((group) =>
    group.candidates.filter((candidate) => candidate.status === "accepted")
  );
}
