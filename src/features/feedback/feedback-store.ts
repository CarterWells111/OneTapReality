export type PurchaseFeedback = {
  priceRange: string;
  materialPreference: string;
  wouldBuy: "yes" | "maybe" | "no";
  wouldRecommend: "yes" | "maybe" | "no";
  note: string;
  createdAt: string;
};

export type FeedbackStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const feedbackKey = "luyi.feedback.v1";

async function readFeedback(storage: FeedbackStorage): Promise<PurchaseFeedback[]> {
  const stored = await storage.getItem(feedbackKey);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as PurchaseFeedback[] : [];
  } catch {
    return [];
  }
}

export async function saveFeedback(storage: FeedbackStorage, feedback: PurchaseFeedback) {
  const existing = await readFeedback(storage);
  await storage.setItem(feedbackKey, JSON.stringify([...existing, feedback]));
}

export async function exportFeedback(storage: FeedbackStorage) {
  const feedback = await readFeedback(storage);
  const lines = feedback.map((item, index) => `${index + 1}. 价格：${item.priceRange}；材料：${item.materialPreference}；购买：${item.wouldBuy}；推荐：${item.wouldRecommend}；备注：${item.note || "无"}`);
  return ["旅忆现场购买意向反馈", "仅供现场反馈展示，不构成订单或支付", ...lines].join("\n");
}
