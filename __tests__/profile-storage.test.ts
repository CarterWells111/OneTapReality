jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
  },
}));

import Storage from "expo-sqlite/kv-store";

import { loadLocalProfile, saveLocalProfile } from "../src/features/profile/profile-storage";

const mockStorage = jest.mocked(Storage);

describe("profile storage", () => {
  beforeEach(() => {
    mockStorage.getItemAsync.mockReset();
    mockStorage.setItemAsync.mockReset();
  });

  it("returns defaults when no local profile is stored", async () => {
    mockStorage.getItemAsync.mockResolvedValue(null);

    await expect(loadLocalProfile()).resolves.toEqual({ nickname: "旅忆用户", avatarUri: null });
  });

  it("returns defaults when the stored profile is malformed", async () => {
    mockStorage.getItemAsync.mockResolvedValue("{malformed json");

    await expect(loadLocalProfile()).resolves.toEqual({ nickname: "旅忆用户", avatarUri: null });
  });

  it("writes the normalized profile using the local profile key", async () => {
    await saveLocalProfile({ nickname: "  小林  ", avatarUri: "file://avatar.jpg" });

    expect(mockStorage.setItemAsync).toHaveBeenCalledWith(
      "luyi.local-profile.v1",
      '{"nickname":"小林","avatarUri":"file://avatar.jpg"}',
    );
  });
});
