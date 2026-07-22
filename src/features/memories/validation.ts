import { cities, type MemoryDraftInput } from "../../types/memory";

export type ValidationResult = {
  issues: string[];
};

export function validateMemoryDraft(
  input: MemoryDraftInput
): ValidationResult {
  const issues: string[] = [];

  if (!input.title.trim()) {
    issues.push("请输入纪念册标题");
  }

  if (!cities.includes(input.city)) {
    issues.push("请选择支持的城市");
  }

  if (input.photoUris.length === 0) {
    issues.push("请至少选择一张照片");
  }

  return { issues };
}

