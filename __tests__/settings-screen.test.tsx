import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockLaunchImageLibrary = jest.fn();
const mockUpdateProfile = jest.fn();
const mockProfile = jest.fn();
const mockIsProfileReady = jest.fn();
const mockForgetRememberedEmail = jest.fn();
const mockUseAuth = jest.fn();
const mockUseLocalLibrary = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));
jest.mock("../src/features/profile/profile-provider", () => ({
  useProfile: () => ({
    profile: mockProfile(),
    isProfileReady: mockIsProfileReady(),
    updateProfile: mockUpdateProfile,
  }),
}));
jest.mock("../src/features/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock("../src/features/auth/local-library-provider", () => ({
  useLocalLibrary: () => mockUseLocalLibrary(),
}));

import SettingsScreen from "../src/app/settings";
import { DEFAULT_BIO } from "../src/features/profile/local-profile";

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile.mockReturnValue({ nickname: "一触如初用户", avatarUri: null });
    mockIsProfileReady.mockReturnValue(true);
    mockUpdateProfile.mockResolvedValue(undefined);
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true, assets: null });
    mockForgetRememberedEmail.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      isAuthReady: true,
      rememberedEmail: "owner@example.com",
      forgetRememberedEmail: mockForgetRememberedEmail,
    });
    mockUseLocalLibrary.mockReturnValue({ owner: "guest", needsMigrationChoice: false });
  });

  it("opens the system photo picker without requesting full-library permission", async () => {
    const screen = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("点击更换头像"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockLaunchImageLibrary).toHaveBeenCalledWith({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ["images"],
        quality: 0.8,
      });
    });
  }, 15000);

  it("waits for the hydrated profile before mounting editable controls", async () => {
    mockIsProfileReady.mockReturnValue(false);
    mockProfile.mockReturnValue({ nickname: "已保存昵称", avatarUri: "file://saved-avatar.jpg" });
    const screen = await render(<SettingsScreen />);

    expect(screen.queryByLabelText("昵称")).toBeNull();
    expect(screen.queryByText("保存资料")).toBeNull();

    await act(async () => {
      mockIsProfileReady.mockReturnValue(true);
      screen.rerender(<SettingsScreen />);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByLabelText("昵称").props.value).toBe("已保存昵称"));
    expect(screen.getByLabelText("已保存昵称的头像").props.source).toEqual({ uri: "file://saved-avatar.jpg" });
  });

  it("shows a stable message when the system picker cannot open", async () => {
    mockLaunchImageLibrary.mockRejectedValue(new Error("picker unavailable"));
    const screen = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("点击更换头像"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByText("无法选择头像，请重试。")).toBeTruthy(),
    );
  });

  it("saves a normalized nickname then returns to the profile page", async () => {
    const screen = await render(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("昵称"), "  小林  ");
    await waitFor(() => expect(screen.getByLabelText("昵称").props.value).toBe("  小林  "));
    await act(async () => {
      fireEvent.press(screen.getByText("保存资料"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        nickname: "小林",
        avatarUri: null,
        bio: DEFAULT_BIO,
      }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("saves a trimmed bio alongside the nickname", async () => {
    const screen = await render(<SettingsScreen />);

    fireEvent.changeText(screen.getByLabelText("签名"), "  记录每一次出发  ");
    await waitFor(() => expect(screen.getByLabelText("签名").props.value).toBe("  记录每一次出发  "));
    await act(async () => {
      fireEvent.press(screen.getByText("保存资料"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        nickname: "一触如初用户",
        avatarUri: null,
        bio: "记录每一次出发",
      }),
    );
  });

  it("prevents a second save while the first save is pending", async () => {
    let finishSave: () => void = () => undefined;
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockUpdateProfile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const screen = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("保存资料"));
      fireEvent.press(screen.getByText("保存资料"));
      await Promise.resolve();
    });

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    await act(async () => finishSave());
    consoleError.mockRestore();
  });

  it("shows the avatar hint text", async () => {
    const screen = await render(<SettingsScreen />);

    expect(screen.getByText("点击头像更换照片")).toBeTruthy();
  });

  it("stays on settings and reports a local save failure", async () => {
    mockUpdateProfile.mockRejectedValue(new Error("write failed"));
    const screen = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("保存资料"));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText("保存资料失败，请重试。")).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("clears the remembered email without changing the local profile", async () => {
    const screen = render(<SettingsScreen />);

    expect(screen.getByText("owner@example.com")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText("清除已记住邮箱")));

    expect(mockForgetRememberedEmail).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("accurately identifies the active local library without implying cloud sync", () => {
    const screen = render(<SettingsScreen />);
    expect(screen.getByText("本机访客旅行册")).toBeTruthy();

    mockUseLocalLibrary.mockReturnValue({ owner: "account:owner@example.com", needsMigrationChoice: false });
    screen.rerender(<SettingsScreen />);
    expect(screen.getByText("当前账户的本机旅行册")).toBeTruthy();
  });

  it("lets a signed-in guest-library user switch or migrate later from settings", async () => {
    const switchToAccount = jest.fn().mockResolvedValue(undefined);
    const migrateToAccount = jest.fn().mockResolvedValue(undefined);
    mockUseLocalLibrary.mockReturnValue({
      accountOwner: "account:owner@example.com",
      isMigrating: false,
      migrateToAccount,
      needsMigrationChoice: false,
      owner: "guest",
      switchToAccount,
    });
    const screen = render(<SettingsScreen />);

    await act(async () => fireEvent.press(screen.getByText("切换到当前账户旅行册")));
    await act(async () => fireEvent.press(screen.getByText("迁移访客旅行册到当前账户")));

    expect(switchToAccount).toHaveBeenCalledTimes(1);
    expect(migrateToAccount).toHaveBeenCalledTimes(1);
  });
});
