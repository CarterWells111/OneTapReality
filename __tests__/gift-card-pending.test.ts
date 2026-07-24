jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { values.delete(key); }),
  };
});

import { clearPendingGiftCard, loadPendingGiftCard, savePendingGiftCard } from "../src/services/gifts/gift-card-pending";

describe("pending gift card activation", () => {
  it("persists the exact reservation until activation can be confirmed", async () => {
    const reservation = { cardId: "card-2", cardCode: "CARD-002", giftUrl: "https://onetapreality.com/gift/unique-token", expiresAt: "2026-07-24T00:15:00.000Z" };

    await savePendingGiftCard(reservation);
    await expect(loadPendingGiftCard()).resolves.toEqual(reservation);
    await clearPendingGiftCard();
    await expect(loadPendingGiftCard()).resolves.toBeNull();
  });
});
