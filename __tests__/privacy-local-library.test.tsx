import { act, render } from "@testing-library/react-native";

const mockDatabase = { runAsync: jest.fn() };
const mockClearMemories = jest.fn();
const mockDeleteAccountPhotoDirectoryStrict = jest.fn();
const mockRelease = jest.fn();
const mockBeginExclusive = jest.fn();

jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock("../src/storage/memory-repository", () => ({
  clearMemories: (...args: unknown[]) => mockClearMemories(...args),
}));
jest.mock("../src/features/memories/photo-persistence", () => ({
  deleteAccountPhotoDirectoryStrict: (...args: unknown[]) =>
    mockDeleteAccountPhotoDirectoryStrict(...args),
}));
jest.mock("../src/features/auth/local-library-write-lease", () => ({
  beginExclusiveLocalLibraryOperation: (...args: unknown[]) => mockBeginExclusive(...args),
}));
jest.mock("../src/features/auth/local-library-provider", () => ({
  useLocalLibrary: () => ({
    accountOwner: "account:owner@example.com",
    isReady: true,
    owner: "account:owner@example.com",
  }),
}));

import { usePrivacyLocalLibrary } from "../src/features/auth/privacy-local-library";

let localLibrary: ReturnType<typeof usePrivacyLocalLibrary> | undefined;

function Capture() {
  localLibrary = usePrivacyLocalLibrary();
  return null;
}

describe("usePrivacyLocalLibrary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localLibrary = undefined;
    mockBeginExclusive.mockResolvedValue({ release: mockRelease });
    mockClearMemories.mockResolvedValue(undefined);
    mockDatabase.runAsync.mockResolvedValue(undefined);
    mockDeleteAccountPhotoDirectoryStrict.mockResolvedValue(undefined);
  });

  it("drains and blocks local writes for the entire account-library deletion", async () => {
    render(<Capture />);

    await act(async () => {
      await localLibrary!.deleteAccountLibrary("account:owner@example.com");
    });

    expect(mockBeginExclusive).toHaveBeenCalledWith(
      mockDatabase,
      "正在删除当前账号的本机旅行册，请稍后再试",
    );
    expect(mockClearMemories).toHaveBeenCalledWith(mockDatabase, "account:owner@example.com");
    expect(mockDatabase.runAsync).toHaveBeenCalledWith(
      "DELETE FROM local_library_account_choices WHERE account_owner = ?",
      "account:owner@example.com",
    );
    expect(mockDeleteAccountPhotoDirectoryStrict).toHaveBeenCalledWith("account:owner@example.com");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("releases the exclusive lease and reports failure when photo deletion fails", async () => {
    mockDeleteAccountPhotoDirectoryStrict.mockRejectedValueOnce(new Error("photo cleanup failed"));
    render(<Capture />);

    await expect(
      localLibrary!.deleteAccountLibrary("account:owner@example.com"),
    ).rejects.toThrow("photo cleanup failed");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
