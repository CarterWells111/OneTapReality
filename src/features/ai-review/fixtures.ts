import type { ReviewGroup } from "./model";

/**
 * 演示用候选组 fixture。证据全部引用用户手填元数据，
 * 不包含任何“识别出人物/地点”的表述。
 */
export const demoReviewGroups: ReviewGroup[] = [
  {
    id: "group-structure",
    title: "册页结构建议",
    candidates: [
      {
        id: "candidate-cover-headline",
        summary: "封面标题使用你填写的旅程名称",
        evidence: [
          { source: "user-title", detail: "你填写的标题：我们的西湖周末" },
          { source: "user-date", detail: "你填写的日期：2026-07-23" },
        ],
        status: "pending",
      },
      {
        id: "candidate-photo-pages",
        summary: "为每张已选照片各生成一页",
        evidence: [
          { source: "photo-count", detail: "你选择了 4 张照片" },
          { source: "photo-order", detail: "按你手动排列的照片顺序排版" },
        ],
        status: "pending",
      },
    ],
  },
  {
    id: "group-copy",
    title: "文案建议",
    candidates: [
      {
        id: "candidate-city-phrase",
        summary: "封底引用你选择的城市的固定句式",
        evidence: [
          { source: "user-city", detail: "你选择的城市：杭州" },
        ],
        status: "pending",
      },
    ],
  },
];
