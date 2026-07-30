jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return { getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null), setItemAsync: jest.fn(async (key: string, value: string) => values.set(key, value)), deleteItemAsync: jest.fn(async (key: string) => values.delete(key) ) };
});

import {
  clearAuthSession,
  clearRememberedEmail,
  loadAuthSession,
  loadRememberedEmail,
  saveAuthSession,
  saveRememberedEmail,
} from "../src/features/auth/auth-storage";

describe("account session storage", () => {
  it("stores only the bearer token and display-safe account identity", async () => {
    const session = { accessToken: "token", user: { id: "user-1", email: "owner@example.com", isAdmin: false } };
    await saveAuthSession(session);
    await expect(loadAuthSession()).resolves.toEqual(session);
    await clearAuthSession();
    await expect(loadAuthSession()).resolves.toBeNull();
  });

  it("remembers only one normalized email independently from the session", async () => {
    await saveRememberedEmail("  Owner@Example.COM ");
    await expect(loadRememberedEmail()).resolves.toBe("owner@example.com");

    await clearAuthSession();
    await expect(loadRememberedEmail()).resolves.toBe("owner@example.com");

    await clearRememberedEmail();
    await expect(loadRememberedEmail()).resolves.toBeNull();
  });
});
