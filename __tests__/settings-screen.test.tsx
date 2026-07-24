import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockRequestPermission = jest.fn();
const mockLaunchImageLibrary = jest.fn();
const mockUpdateProfile = jest.fn();
const mockProfile = jest.fn();
const mockIsProfileReady = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));
jest.mock("../src/features/profile/profile-provider", () => ({
  useProfile: () => ({
    profile: mockProfile(),
    isProfileReady: mockIsProfileReady(),
    updateProfile: mockUpdateProfile,
  }),
}));

import SettingsScreen from "../src/app/settings";
import { DEFAULT_BIO } from "../src/features/profile/local-profile";

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile.mockReturnValue({ nickname: "旅忆用户", avatarUri: null });
    mockIsProfileReady.mockReturnValue(true);
    mockUpdateProfile.mockResolvedValue(undefined);
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true, assets: null });
  });

  it("requests photo permission when tapping the avatar", async () => {
    const screen = await render(<SettingsScreen />);

    expect(mockRequestPermission).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("点击更换头像"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
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

  it("shows the exact permission guidance when photo access is denied", async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });
    const screen = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("点击更换头像"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByText("未获得照片权限。你可以在系统设置中允许访问后再选择头像。")).toBeTruthy(),
    );
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled();
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
        nickname: "旅忆用户",
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
});
