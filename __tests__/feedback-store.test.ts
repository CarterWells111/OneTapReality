import { exportFeedback, saveFeedback, type FeedbackStorage } from "../src/features/feedback/feedback-store";

function createStorage(): FeedbackStorage {
  const values = new Map<string, string>();
  return { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
}

describe("local purchase feedback", () => {
  it("starts exported feedback with the OneTapReality header", async () => {
    const exported = await exportFeedback(createStorage());

    expect(exported.startsWith("一触如初现场购买意向反馈")).toBe(true);
  });

  it("persists purchase intent locally and exports a display-only summary", async () => {
    const storage = createStorage();
    await saveFeedback(storage, { priceRange: "¥199–299", materialPreference: "环保纸", wouldBuy: "yes", wouldRecommend: "maybe", note: "希望有杭州限定版", createdAt: "2026-07-22T10:00:00.000Z" });

    await expect(exportFeedback(storage)).resolves.toContain("杭州限定版");
    await expect(exportFeedback(storage)).resolves.toContain("仅供现场反馈展示，不构成订单或支付");
  });
});
