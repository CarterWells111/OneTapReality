import type { Memory } from "../../types/memory";

export const sampleMemory: Memory = {
  id: "sample-hangzhou",
  title: "我们的西湖周末",
  city: "hangzhou",
  travelDate: "2026-05-18",
  photoUris: [],
  createdAt: "2026-05-18T10:00:00.000Z",
  updatedAt: "2026-05-18T10:00:00.000Z",
  pages: [
    {
      id: "sample-cover",
      position: 0,
      kind: "cover",
      headline: "我们的西湖周末",
      body: "杭州 · 在西湖边慢慢走过的这一天",
    },
    {
      id: "sample-photo",
      position: 1,
      kind: "photo",
      headline: "午后，湖边的风",
      body: "照片不必完美，只要一看到它，就会想起那天我们并肩的样子。",
    },
    {
      id: "sample-closing",
      position: 2,
      kind: "closing",
      headline: "下一次，继续一起出发",
      body: "这是一本可以不断补完的旅行册。",
    },
  ],
};

