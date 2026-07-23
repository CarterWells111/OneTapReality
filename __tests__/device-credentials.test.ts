jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => values.set(key, value)),
  };
});

import {
  loadAccessToken,
  loadOrCreateInstallationId,
  saveAccessToken,
} from "../src/services/backend/device-credentials";

describe("backend device credentials", () => {
  it("persists the installation id and access token in SecureStore", async () => {
    const installationId = await loadOrCreateInstallationId();
    expect(installationId).toEqual(expect.any(String));

    await saveAccessToken("opaque-token");
    await expect(loadAccessToken()).resolves.toBe("opaque-token");
    await expect(loadOrCreateInstallationId()).resolves.toBe(installationId);
  });
});
