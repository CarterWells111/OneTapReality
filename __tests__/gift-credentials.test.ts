jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return { getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null), setItemAsync: jest.fn(async (key: string, value: string) => values.set(key, value)), deleteItemAsync: jest.fn(async (key: string) => values.delete(key)) };
});

import { clearGiftSession, loadGiftSession, saveGiftSession } from "../src/services/gifts/gift-credentials";

describe("gift credentials", () => {
  it("stores and clears an authenticated gift session in SecureStore", async () => {
    await saveGiftSession({ accessToken: "token", email: "owner@example.com" });
    await expect(loadGiftSession()).resolves.toEqual({ accessToken: "token", email: "owner@example.com" });
    await clearGiftSession();
    await expect(loadGiftSession()).resolves.toBeNull();
  });
});
