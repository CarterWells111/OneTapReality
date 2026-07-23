jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
  },
}));

import Storage from "expo-sqlite/kv-store";

import { DEFAULT_BIO } from "../src/features/profile/local-profile";
import { loadLocalProfile, saveLocalProfile } from "../src/features/profile/profile-storage";

const mockStorage = jest.mocked(Storage);

const defaultProfile = { nickname: "一触如初用户", avatarUri: null, bio: DEFAULT_BIO };

describe("profile storage", () => {
  beforeEach(() => {
    mockStorage.getItemAsync.mockReset();
    mockStorage.setItemAsync.mockReset();
  });

  it("returns defaults when no local profile is stored", async () => {
    mockStorage.getItemAsync.mockResolvedValue(null);

    await expect(loadLocalProfile()).resolves.toEqual(defaultProfile);
  });

  it("returns defaults when reading the stored profile fails", async () => {
    mockStorage.getItemAsync.mockRejectedValueOnce(new Error("read failed"));

    await expect(loadLocalProfile()).resolves.toEqual(defaultProfile);
  });

  it("returns defaults when the stored profile is malformed", async () => {
    mockStorage.getItemAsync.mockResolvedValue("{malformed json");

    await expect(loadLocalProfile()).resolves.toEqual(defaultProfile);
  });

  it("keeps the brand slogan for profiles stored before the bio field existed", async () => {
    mockStorage.getItemAsync.mockResolvedValue(
      '{"nickname":"小林","avatarUri":null}',
    );

    await expect(loadLocalProfile()).resolves.toEqual({
      nickname: "小林",
      avatarUri: null,
      bio: DEFAULT_BIO,
    });
  });

  it("writes the normalized profile using the local profile key", async () => {
    await saveLocalProfile({
      nickname: "  小林  ",
      avatarUri: "file://avatar.jpg",
      bio: "  记录每一次出发  ",
    });

    expect(mockStorage.setItemAsync).toHaveBeenCalledWith(
      "luyi.local-profile.v1",
      `{"nickname":"小林","avatarUri":"file://avatar.jpg","bio":"记录每一次出发"}`,
    );
  });
});
